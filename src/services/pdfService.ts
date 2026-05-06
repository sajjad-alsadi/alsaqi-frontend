import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// This service will handle PDF generation for audit reports
// It will support both Arabic and English

export const generateAuditReport = async (data: any, options: { language: 'ar' | 'en' }) => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  });

  // TODO: Add Arabic font support (base64)
  // For now, we'll use standard fonts for English and placeholders for Arabic
  
  const isRtl = options.language === 'ar';
  const title = isRtl ? 'تقرير التدقيق الداخلي' : 'Internal Audit Report';
  const date = new Date().toLocaleDateString(options.language === 'ar' ? 'ar-SA' : 'en-US');

  // Header
  doc.setFontSize(20);
  doc.text(title, isRtl ? 190 : 20, 20, { align: isRtl ? 'right' : 'left' });
  
  doc.setFontSize(10);
  doc.text(`${isRtl ? 'التاريخ' : 'Date'}: ${date}`, isRtl ? 190 : 20, 30, { align: isRtl ? 'right' : 'left' });

  // Add some dummy data table
  const tableData = [
    [isRtl ? 'رقم' : 'No', isRtl ? 'المهمة' : 'Task', isRtl ? 'الحالة' : 'Status'],
    ['1', isRtl ? 'تدقيق الخزينة' : 'Vault Audit', isRtl ? 'مكتمل' : 'Completed'],
    ['2', isRtl ? 'تدقيق الامتثال' : 'Compliance Audit', isRtl ? 'قيد التنفيذ' : 'In Progress'],
    ['3', isRtl ? 'تدقيق تقنية المعلومات' : 'IT Audit', isRtl ? 'مخطط' : 'Planned'],
  ];

  (doc as any).autoTable({
    startY: 40,
    head: [tableData[0]],
    body: tableData.slice(1),
    styles: {
      font: 'helvetica', // Placeholder
      halign: isRtl ? 'right' : 'left',
    },
    headStyles: {
      fillColor: [10, 125, 133],
      textColor: [255, 255, 255],
    },
  });

  doc.save(`Audit_Report_${new Date().getTime()}.pdf`);
};
