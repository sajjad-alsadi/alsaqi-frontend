import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import handlebars from 'handlebars';
import html2canvas from 'html2canvas';
import { TAHOMA_FONT_BASE64 } from '../assets/fonts/tahoma-base64';

export const generateDynamicPdf = async (
  templateContent: string,
  data: any,
  fileName: string
) => {
  try {
    // 1. Compile template
    const template = handlebars.compile(templateContent);
    const htmlString = template(data);

    // 2. Create a temporary container
    const container = document.createElement('div');
    container.innerHTML = htmlString;
    container.style.position = 'absolute';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '800px'; // A4 width approx in pixels
    container.style.background = 'white';
    document.body.appendChild(container);

    // 3. Render to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
    });

    // 4. Create PDF
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4'
    });

    const imgData = canvas.toDataURL('image/png');
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    // Handle pagination roughly
    let heightLeft = pdfHeight;
    let position = 0;
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - pdfHeight;
      doc.addPage();
      doc.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }

    doc.save(`${fileName}.pdf`);

    // Clean up
    document.body.removeChild(container);
  } catch (err) {
    console.error('Error generating dynamic PDF', err);
    throw err;
  }
};

export const fetchPdfSettings = async (token: string) => {
  try {
    const res = await api.get('/pdf-settings', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data) {
      return res.data;
    }
  } catch (err) {
    console.error('Error fetching PDF settings:', err);
  }
  return null;
};

export interface PdfSection {
  type: 'text' | 'table';
  title?: string;
  content?: string;
  columns?: any[];
  data?: any[];
}

// Use locally embedded font (no internet required)
let cachedArabicFont: string | null = TAHOMA_FONT_BASE64;

export const generatePdf = async (
  title: string, 
  sections: PdfSection[],
  token: string,
  language: 'ar' | 'en',
  templateType?: string,
  templateData?: any
) => {
  if (templateType && templateData) {
    try {
      const res = await api.get(`/pdf-templates/active?type=${encodeURIComponent(templateType)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data && res.data.content) {
        await generateDynamicPdf(res.data.content, templateData, title);
        return;
      }
    } catch (e) {
      console.warn(`No active template found for ${templateType}, falling back to legacy export.`);
    }
  }
  const settings = await fetchPdfSettings(token) || {
    arabic_font_name: 'Cairo',
    arabic_font_size: 12,
    heading_font_size: 16,
    subheading_font_size: 14,
    table_font_size: 10,
    rtl_enabled: language === 'ar' ? 1 : 0,
    margin_top: 40,
    margin_right: 40,
    margin_bottom: 40,
    margin_left: 40,
    header_template: '',
    footer_template: '',
    logo_position: 'right',
    show_page_number: 1
  };

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const isRTL = settings.rtl_enabled === 1 || language === 'ar';
  
  if (isRTL) {
    try {
      doc.addFileToVFS('Tahoma.ttf', cachedArabicFont);
      doc.addFont('Tahoma.ttf', 'Tahoma', 'normal');
      doc.setFont('Tahoma');
      settings.arabic_font_name = 'Tahoma';
    } catch (e) {
      console.error('Failed to load Arabic font', e);
      doc.setFont('helvetica');
      settings.arabic_font_name = 'helvetica';
    }
  } else {
    doc.setFont('helvetica');
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  let currentY = settings.margin_top;

  // Header
  if (settings.header_template) {
    doc.setFontSize(settings.subheading_font_size);
    doc.text(settings.header_template, isRTL ? pageWidth - settings.margin_right : settings.margin_left, currentY, { align: isRTL ? 'right' : 'left' });
    currentY += 30;
  }

  // Title
  doc.setFontSize(settings.heading_font_size);
  doc.text(title, pageWidth / 2, currentY, { align: 'center' });
  currentY += 40;

  for (const section of sections) {
    if (section.title) {
      doc.setFontSize(settings.subheading_font_size);
      doc.text(section.title, isRTL ? pageWidth - settings.margin_right : settings.margin_left, currentY, { align: isRTL ? 'right' : 'left' });
      currentY += 20;
    }

    if (section.type === 'text' && section.content) {
      doc.setFontSize(settings.arabic_font_size);
      const splitText = doc.splitTextToSize(section.content, pageWidth - settings.margin_left - settings.margin_right);
      doc.text(splitText, isRTL ? pageWidth - settings.margin_right : settings.margin_left, currentY, { align: isRTL ? 'right' : 'left' });
      currentY += (splitText.length * (settings.arabic_font_size + 4)) + 20;
    } else if (section.type === 'table' && section.columns && section.columns.length > 0 && section.data) {
      const tableBody = section.data.length > 0 
        ? section.data.map(row => section.columns!.map(c => {
            const val = row[c.dataKey];
            return val !== undefined && val !== null ? String(val) : '';
          }))
        : [[{ content: isRTL ? 'لا توجد بيانات' : 'No data available', colSpan: section.columns.length, styles: { halign: 'center' as const } }]];

      autoTable(doc, {
        startY: currentY,
        head: [section.columns.map(c => c.header)],
        body: tableBody,
        styles: {
          font: isRTL ? settings.arabic_font_name : 'helvetica',
          fontSize: settings.table_font_size,
          halign: isRTL ? 'right' : 'left',
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center'
        },
        margin: { 
          top: settings.margin_top, 
          right: settings.margin_right, 
          bottom: settings.margin_bottom, 
          left: settings.margin_left 
        },
        didDrawPage: (data: any) => {
          // Footer is drawn later for all pages
        }
      });
      currentY = (doc as any).lastAutoTable.finalY + 30;
    }
  }

  // Draw footer on all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (settings.footer_template || settings.show_page_number === 1) {
      doc.setFontSize(10);
      const footerText = `${settings.footer_template} ${settings.show_page_number === 1 ? (isRTL ? `صفحة ${i}` : `Page ${i}`) : ''}`;
      doc.text(footerText, pageWidth / 2, pageHeight - settings.margin_bottom / 2, { align: 'center' });
    }
  }

  doc.save(`${title}.pdf`);
};
