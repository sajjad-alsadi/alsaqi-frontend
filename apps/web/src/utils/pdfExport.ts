/**
 * PDF Export Utilities
 *
 * PRIMARY PATH: Server-side PDF generation via POST /reports/generate
 * (uses Puppeteer — see PdfEngine in packages/api/)
 *
 * EMERGENCY FALLBACK ONLY: jsPDF + jspdf-autotable below.
 * Used only when the server-side endpoint is unreachable.
 * html2canvas has been removed — it produced rasterized (image-based) PDFs
 * with no selectable text, poor RTL support, and unreliable rendering.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/httpClient';
import { TAHOMA_FONT_BASE64 } from '../assets/fonts/tahoma-base64';
import i18n from '../i18n';

const t = i18n.t.bind(i18n);

export interface PdfColumn {
  header: string;
  dataKey: string;
}

export interface PdfSection {
  type: 'text' | 'table';
  title?: string;
  content?: string;
  columns?: PdfColumn[];
  data?: Array<Record<string, unknown>>;
}

/**
 * jsPDF surface contributed by the `jspdf-autotable` plugin. The plugin augments
 * the runtime `jsPDF` instance with `lastAutoTable` (and exposes `getNumberOfPages`)
 * but does not ship a module augmentation in this version, so we describe it locally
 * to access these members without `as any`.
 */
interface JsPDFWithAutoTable {
  lastAutoTable?: { finalY: number };
  getNumberOfPages(): number;
}

// Use locally embedded font (no internet required)
let cachedArabicFont: string | null = TAHOMA_FONT_BASE64;

/**
 * generatePdf — Emergency fallback using jsPDF (client-side).
 *
 * The primary PDF generation path is server-side via POST /reports/generate.
 * This function is kept ONLY as a fallback when the server is unreachable.
 * It does NOT use html2canvas (removed) — it renders directly via jsPDF text/table APIs.
 */
export const generatePdf = async (
  title: string, 
  sections: PdfSection[],
  token: string,
  language: 'ar' | 'en',
  _templateType?: string,
  _templateData?: unknown
) => {
  // NOTE: Template-based rendering (via html2canvas) has been removed.
  // The primary path is now server-side. This fallback uses jsPDF directly.

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
        : [[{ content: t('export.noData'), colSpan: section.columns.length, styles: { halign: 'center' as const } }]];

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
        didDrawPage: () => {
          // Footer is drawn later for all pages
        }
      });
      currentY = ((doc as jsPDF & JsPDFWithAutoTable).lastAutoTable?.finalY ?? currentY) + 30;
    }
  }

  // Draw footer on all pages
  const pageCount = (doc as jsPDF & JsPDFWithAutoTable).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (settings.footer_template || settings.show_page_number === 1) {
      doc.setFontSize(10);
      const footerText = `${settings.footer_template} ${settings.show_page_number === 1 ? t('export.pageOf', { current: i, total: pageCount }) : ''}`;
      doc.text(footerText, pageWidth / 2, pageHeight - settings.margin_bottom / 2, { align: 'center' });
    }
  }

  doc.save(`${title}.pdf`);
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
