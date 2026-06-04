import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { TAHOMA_FONT_BASE64 } from '../assets/fonts/tahoma-base64';
import i18n from '../i18n';

const t = i18n.t.bind(i18n);

/**
 * PDF Service - Generates audit reports with full Arabic/English support.
 * Uses embedded Tahoma font for Arabic text rendering (no internet required).
 */

// Register the Arabic font once
let fontRegistered = false;

function registerArabicFont(doc: jsPDF) {
  if (!fontRegistered) {
    doc.addFileToVFS('Tahoma.ttf', TAHOMA_FONT_BASE64);
    doc.addFont('Tahoma.ttf', 'Tahoma', 'normal');
    fontRegistered = true;
  } else {
    // Font already in VFS from a previous call, just re-add to this doc instance
    doc.addFileToVFS('Tahoma.ttf', TAHOMA_FONT_BASE64);
    doc.addFont('Tahoma.ttf', 'Tahoma', 'normal');
  }
}

export interface AuditReportData {
  title?: string;
  planCode?: string;
  department?: string;
  leadAuditor?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  tasks?: Array<{ title: string; status: string; assignee?: string }>;
  findings?: Array<{ title: string; riskLevel: string; description?: string }>;
  recommendations?: Array<{ action: string; status: string; deadline?: string }>;
}

export const generateAuditReport = async (data: AuditReportData, options: { language: 'ar' | 'en' }) => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  });

  const isRtl = options.language === 'ar';
  
  // Register and set Arabic font
  registerArabicFont(doc);
  doc.setFont('Tahoma');

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // === Header ===
  doc.setFontSize(18);
  const title = data.title || t('export.internalAuditReport');
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // Divider line
  doc.setDrawColor(41, 128, 185);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // === Report Info ===
  doc.setFontSize(10);
  const infoItems = [
    { label: t('export.planCode'), value: data.planCode || '-' },
    { label: t('export.department'), value: data.department || '-' },
    { label: t('export.leadAuditor'), value: data.leadAuditor || '-' },
    { label: t('export.status'), value: data.status || '-' },
    { label: t('export.startDate'), value: data.startDate || '-' },
    { label: t('export.endDate'), value: data.endDate || '-' },
  ];

  for (const item of infoItems) {
    const text = `${item.label}: ${item.value}`;
    doc.text(text, isRtl ? pageWidth - margin : margin, y, { align: isRtl ? 'right' : 'left' });
    y += 6;
  }
  y += 8;

  // === Tasks Table ===
  if (data.tasks && data.tasks.length > 0) {
    doc.setFontSize(13);
    const tasksTitle = t('export.tasks');
    doc.text(tasksTitle, isRtl ? pageWidth - margin : margin, y, { align: isRtl ? 'right' : 'left' });
    y += 8;

    const taskHeaders = isRtl 
      ? [t('export.taskStatus'), t('export.assignedTo'), t('export.task'), '#']
      : ['#', t('export.task'), t('export.assignedTo'), t('export.taskStatus')];

    const taskRows = data.tasks.map((t, i) => {
      const row = [String(i + 1), t.title, t.assignee || '-', t.status];
      return isRtl ? row.reverse() : row;
    });

    (doc as any).autoTable({
      startY: y,
      head: [taskHeaders],
      body: taskRows,
      styles: {
        font: 'Tahoma',
        fontSize: 9,
        halign: isRtl ? 'right' : 'left',
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // === Findings Table ===
  if (data.findings && data.findings.length > 0) {
    // Check if we need a new page
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(13);
    const findingsTitle = t('export.findings');
    doc.text(findingsTitle, isRtl ? pageWidth - margin : margin, y, { align: isRtl ? 'right' : 'left' });
    y += 8;

    const findingHeaders = isRtl
      ? [t('export.riskLevel'), t('export.description'), t('export.finding'), '#']
      : ['#', t('export.finding'), t('export.description'), t('export.riskLevel')];

    const findingRows = data.findings.map((f, i) => {
      const row = [String(i + 1), f.title, f.description || '-', f.riskLevel];
      return isRtl ? row.reverse() : row;
    });

    (doc as any).autoTable({
      startY: y,
      head: [findingHeaders],
      body: findingRows,
      styles: {
        font: 'Tahoma',
        fontSize: 9,
        halign: isRtl ? 'right' : 'left',
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [192, 57, 43],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // === Recommendations Table ===
  if (data.recommendations && data.recommendations.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(13);
    const recTitle = t('export.recommendations');
    doc.text(recTitle, isRtl ? pageWidth - margin : margin, y, { align: isRtl ? 'right' : 'left' });
    y += 8;

    const recHeaders = isRtl
      ? [t('export.deadline'), t('export.recStatus'), t('export.action'), '#']
      : ['#', t('export.action'), t('export.recStatus'), t('export.deadline')];

    const recRows = data.recommendations.map((r, i) => {
      const row = [String(i + 1), r.action, r.status, r.deadline || '-'];
      return isRtl ? row.reverse() : row;
    });

    (doc as any).autoTable({
      startY: y,
      head: [recHeaders],
      body: recRows,
      styles: {
        font: 'Tahoma',
        fontSize: 9,
        halign: isRtl ? 'right' : 'left',
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [39, 174, 96],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      margin: { left: margin, right: margin },
    });
  }

  // === Footer on all pages ===
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    const footerText = t('export.pageOf', { current: i, total: pageCount });
    doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    const dateText = new Date().toLocaleDateString(isRtl ? 'ar-SA' : 'en-US');
    doc.text(dateText, isRtl ? margin : pageWidth - margin, pageHeight - 10, { align: isRtl ? 'left' : 'right' });
    doc.setTextColor(0);
  }

  doc.save(`${title.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
};
