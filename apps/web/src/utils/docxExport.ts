import { 
  Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, 
  Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, PageBreak, 
  TextDirection, VerticalAlign, ShadingType
} from 'docx';
import { saveAs } from 'file-saver';
import i18n from '../i18n';

const t = i18n.t.bind(i18n);

const PRIMARY_COLOR = "0A7D85";
const MUTED_COLOR = "64748B";
const LIGHT_FILL = "F8FAFC";

export const generateQuarterlyReportDocx = async (data: unknown, language: 'ar' | 'en') => {
  void data; // reserved for future data-driven rendering; content currently sourced from i18n
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
              text: t('export.companyHeader'),
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
                          text: t('export.internalUseOnly'),
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
                          text: t('export.auditDepartment'),
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
                          text: t('export.page') + ' ',
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
    const rows = [
      [t('export.tocSection'), t('export.tocPageNote')],
      [t('export.tocDocControl'), t('export.tocAutoUpdate')],
      [t('export.executiveSummary'), t('export.tocAutoUpdate')],
      [t('export.reportIntroduction'), t('export.tocAutoUpdate')],
      [t('export.tocPlanVsAchieved'), t('export.tocAutoUpdate')],
      [t('export.tocCompletedWork'), t('export.tocAutoUpdate')],
      [t('export.tocFindings'), t('export.tocAutoUpdate')],
      [t('export.tocRecommendations'), t('export.tocAutoUpdate')],
      [t('export.tocIssues'), t('export.tocAutoUpdate')],
      [t('export.tocNeeds'), t('export.tocAutoUpdate')],
      [t('export.tocPriorities'), t('export.tocAutoUpdate')],
      [t('export.tocConclusion'), t('export.tocAutoUpdate')],
      [t('export.tocSignatures'), t('export.tocAutoUpdate')],
    ];

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map((row, index) => {
        return new TableRow({
          children: row.map((cellText, cellIndex) => {
            return new TableCell({
              width: { size: cellIndex === 0 ? 60 : 40, type: WidthType.PERCENTAGE },
              ...(index === 0 ? { shading: { fill: LIGHT_FILL, type: ShadingType.CLEAR, color: "auto" } } : {}),
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
                text: t('export.companyName'),
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
                text: t('export.quarterlyReport'),
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
          createHeading(t('export.tableOfContents'), 1),
          createParagraph(t('export.tocDescription'), MUTED_COLOR),
          createTocTable(),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.executiveSummary'), 1),
          createParagraph(t('export.executiveSummaryContent')),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.reportIntroduction'), 1),
          createParagraph(t('export.reportIntroductionContent')),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.quarterlyPlanVsAchieved'), 1),
          createParagraph(t('export.quarterlyPlanContent')),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.completedEngagements'), 1),
          createParagraph(t('export.completedEngagementsContent')),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.materialFindings'), 1),
          createParagraph(t('export.materialFindingsContent')),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.previousRecommendations'), 1),
          createParagraph(t('export.previousRecommendationsContent')),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.auditIssues'), 1),
          createParagraph(t('export.auditIssuesContent')),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.needsAndSupport'), 1),
          createParagraph(t('export.needsAndSupportContent')),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.nextQuarterPriorities'), 1),
          createParagraph(t('export.nextQuarterPrioritiesContent')),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.conclusion'), 1),
          createParagraph(t('export.conclusionContent')),
          new Paragraph({ children: [new PageBreak()] }),
          
          createHeading(t('export.signaturesAndApproval'), 1),
          createParagraph(t('export.signaturesContent')),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Quarterly_Report_${new Date().getTime()}.docx`);
};
