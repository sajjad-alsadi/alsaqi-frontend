import { 
  Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, 
  Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, PageBreak, 
  TextDirection, VerticalAlign, ShadingType
} from 'docx';
import { saveAs } from 'file-saver';

const PRIMARY_COLOR = "0A7D85";
const MUTED_COLOR = "64748B";
const LIGHT_FILL = "F8FAFC";

export const generateQuarterlyReportDocx = async (data: any, language: 'ar' | 'en') => {
  const isRtl = language === 'ar';

  const createHeader = () => {
    return new Header({
      children: [
        new Paragraph({
          alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: isRtl,
          border: {
            bottom: {
              color: PRIMARY_COLOR,
              space: 1,
              style: BorderStyle.SINGLE,
              size: 10,
            },
          },
          children: [
            new TextRun({
              text: isRtl 
                ? "شركة الساقي لخدمات الدفع الإلكتروني | قسم الرقابة والتدقيق الداخلي | التقرير الفصلي"
                : "Al-Saqi E-Payment Services | Internal Audit Department | Quarterly Report",
              bold: true,
              size: 20, // 10pt
              color: PRIMARY_COLOR,
              rightToLeft: isRtl,
            }),
          ],
        }),
      ],
    });
  };

  const createFooter = () => {
    return new Footer({
      children: [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 33, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                      bidirectional: isRtl,
                      children: [
                        new TextRun({
                          text: isRtl ? "للاستخدام الداخلي" : "Internal Use Only",
                          size: 20,
                          rightToLeft: isRtl,
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 34, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      bidirectional: isRtl,
                      children: [
                        new TextRun({
                          text: isRtl ? "قسم الرقابة والتدقيق الداخلي" : "Internal Audit Department",
                          size: 20,
                          rightToLeft: isRtl,
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 33, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      alignment: isRtl ? AlignmentType.LEFT : AlignmentType.RIGHT,
                      bidirectional: isRtl,
                      children: [
                        new TextRun({
                          text: isRtl ? "صفحة " : "Page ",
                          size: 20,
                          rightToLeft: isRtl,
                        }),
                        // Page numbers are complex in docx.js, using simple text for now
                        // In a real scenario, we'd use PageNumber field
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  };

  const createHeading = (text: string, level: number = 1) => {
    return new Paragraph({
      text: text,
      heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
      alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      bidirectional: isRtl,
      spacing: { before: 240, after: 120 },
    });
  };

  const createParagraph = (text: string, color: string = "000000", bold: boolean = false) => {
    return new Paragraph({
      alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      bidirectional: isRtl,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: text,
          size: 24, // 12pt
          color: color,
          bold: bold,
          rightToLeft: isRtl,
        }),
      ],
    });
  };

  const createTocTable = () => {
    const rows = isRtl ? [
      ["القسم", "الصفحة / الملاحظة"],
      ["بيانات الوثيقة والتحكم بالإصدار", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["الملخص التنفيذي", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["مقدمة التقرير", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["الخطة الفصلية مقابل المنجز", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["الأعمال والمهمات التدقيقية المنجزة", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["الملاحظات الجوهرية والنتائج الرقابية", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["حالة تنفيذ التوصيات السابقة", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["القضايا الرقابية والتحديات", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["الاحتياجات والدعم المطلوب", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["أولويات الفصل القادم", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["الخاتمة", "[تُحدّث تلقائياً عند استخدام Word]"],
      ["التوقيعات والاعتماد", "[تُحدّث تلقائياً عند استخدام Word]"],
    ] : [
      ["Section", "Page / Note"],
      ["Document Data and Version Control", "[Auto-updated in Word]"],
      ["Executive Summary", "[Auto-updated in Word]"],
      ["Report Introduction", "[Auto-updated in Word]"],
      ["Quarterly Plan vs. Achieved", "[Auto-updated in Word]"],
      ["Completed Audit Engagements and Tasks", "[Auto-updated in Word]"],
      ["Material Findings and Audit Results", "[Auto-updated in Word]"],
      ["Status of Previous Recommendations", "[Auto-updated in Word]"],
      ["Audit Issues and Challenges", "[Auto-updated in Word]"],
      ["Needs and Required Support", "[Auto-updated in Word]"],
      ["Priorities for Next Quarter", "[Auto-updated in Word]"],
      ["Conclusion", "[Auto-updated in Word]"],
      ["Signatures and Approval", "[Auto-updated in Word]"],
    ];

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map((row, index) => {
        return new TableRow({
          children: row.map((cellText, cellIndex) => {
            return new TableCell({
              width: { size: cellIndex === 0 ? 60 : 40, type: WidthType.PERCENTAGE },
              shading: index === 0 ? { fill: LIGHT_FILL, type: ShadingType.CLEAR, color: "auto" } : undefined,
              children: [
                new Paragraph({
                  alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  bidirectional: isRtl,
                  children: [
                    new TextRun({
                      text: cellText,
                      bold: index === 0,
                      rightToLeft: isRtl,
                    }),
                  ],
                }),
              ],
            });
          }),
        });
      }),
    });
  };

  const doc = new Document({
    sections: [
      // Cover Page
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 2000, after: 400 },
            children: [
              new TextRun({
                text: isRtl ? "شركة الساقي لخدمات الدفع الإلكتروني" : "Al-Saqi E-Payment Services",
                bold: true,
                size: 48,
                color: PRIMARY_COLOR,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 2000 },
            children: [
              new TextRun({
                text: isRtl ? "التقرير الفصلي للرقابة والتدقيق الداخلي" : "Quarterly Internal Audit Report",
                bold: true,
                size: 36,
              }),
            ],
          }),
          new Paragraph({
            children: [new PageBreak()],
          }),
        ],
      },
      // Main Content
      {
        properties: {},
        headers: { default: createHeader() },
        footers: { default: createFooter() },
        children: [
          createHeading(isRtl ? "فهرس المحتويات" : "Table of Contents", 1),
          createParagraph(
            isRtl 
              ? "يوضح هذا الفهرس الهيكل المقترح للتقرير الفصلي. يمكن تحديث الفهرس التلقائي داخل Microsoft Word بعد الانتهاء من إدخال المحتوى النهائي."
              : "This index outlines the proposed structure for the quarterly report. The automatic TOC can be updated in Microsoft Word after final content is entered.",
            MUTED_COLOR
          ),
          createTocTable(),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "الملخص التنفيذي" : "Executive Summary", 1),
          createParagraph(isRtl ? "محتوى الملخص التنفيذي..." : "Executive summary content..."),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "مقدمة التقرير" : "Report Introduction", 1),
          createParagraph(isRtl ? "محتوى المقدمة..." : "Introduction content..."),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "الخطة الفصلية مقابل المنجز" : "Quarterly Plan vs. Achieved", 1),
          createParagraph(isRtl ? "محتوى الخطة..." : "Plan content..."),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "الأعمال والمهمات التدقيقية المنجزة" : "Completed Audit Engagements", 1),
          createParagraph(isRtl ? "محتوى الأعمال المنجزة..." : "Completed engagements content..."),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "الملاحظات الجوهرية والنتائج الرقابية" : "Material Findings and Audit Results", 1),
          createParagraph(isRtl ? "محتوى الملاحظات..." : "Findings content..."),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "حالة تنفيذ التوصيات السابقة" : "Status of Previous Recommendations", 1),
          createParagraph(isRtl ? "محتوى التوصيات..." : "Recommendations content..."),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "القضايا الرقابية والتحديات" : "Audit Issues and Challenges", 1),
          createParagraph(isRtl ? "محتوى التحديات..." : "Challenges content..."),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "الاحتياجات والدعم المطلوب" : "Needs and Required Support", 1),
          createParagraph(isRtl ? "محتوى الاحتياجات..." : "Needs content..."),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "أولويات الفصل القادم" : "Priorities for Next Quarter", 1),
          createParagraph(isRtl ? "محتوى الأولويات..." : "Priorities content..."),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "الخاتمة" : "Conclusion", 1),
          createParagraph(isRtl ? "محتوى الخاتمة..." : "Conclusion content..."),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(isRtl ? "التوقيعات والاعتماد" : "Signatures and Approval", 1),
          createParagraph(isRtl ? "التوقيعات..." : "Signatures..."),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Quarterly_Report_${new Date().getTime()}.docx`);
};
