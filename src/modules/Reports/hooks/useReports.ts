import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { useUser } from '../../../context/UserContext';
import { useAppContext } from '../../../context/AppContext';
import { AuditReport, AuditPlan, AuditFinding, ExecData, ReportType } from '../types';
import * as reportService from '../services/reportService';
import { generatePdf, PdfSection } from '../../../utils/pdfExport';

export const useReports = (activeSubTab: 'audit' | 'executive') => {
  const { token } = useAuth();
  const { user } = useUser();
  const { fetchNotifications } = useAppContext();
  const { t, i18n } = useTranslation();
  
  // State
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [audits, setAudits] = useState<AuditPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | number | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');

  const [selectedAuditId, setSelectedAuditId] = useState<string | number | null>(null);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [selectedFindings, setSelectedFindings] = useState<(string | number)[]>([]);
  const [reportTitle, setReportTitle] = useState('');
  const [reportSummary, setReportSummary] = useState('');
  const [selectedReportType, setSelectedReportType] = useState<string>('auditReport');

  const [execData, setExecData] = useState<ExecData | null>(null);
  const [execLoading, setExecLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reportTypes: ReportType[] = [
    { id: 'auditReport', label: t('reports.auditReport'), description: t('reports.auditReportDesc') },
    { id: 'quarterlyReport', label: t('reports.quarterlyReport'), description: t('reports.quarterlyReportDesc') },
    { id: 'complianceRequirements', label: t('reports.complianceRequirements'), description: t('reports.complianceRequirementsDesc') },
    { id: 'activityAuditResults', label: t('reports.activityAuditResults'), description: t('reports.activityAuditResultsDesc') },
    { id: 'eventParticipationSummary', label: t('reports.eventParticipationSummary'), description: t('reports.eventParticipationSummaryDesc') },
    { id: 'monthlyDepartmentReport', label: t('reports.monthlyDepartmentReport'), description: t('reports.monthlyDepartmentReportDesc') },
  ];

  useEffect(() => {
    if (activeSubTab === 'audit') {
      fetchReports();
      fetchAudits();
    } else {
      fetchExecData();
    }
  }, [activeSubTab]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await reportService.fetchReports();
      setReports(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAudits = async () => {
    try {
      const data = await reportService.fetchAudits();
      setAudits(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchExecData = async () => {
    setExecLoading(true);
    try {
      const data = await reportService.fetchExecData();
      setExecData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setExecLoading(false);
    }
  };

  const handleAuditSelect = async (auditId: string | number) => {
    setSelectedAuditId(auditId);
    const audit = audits.find(a => String(a.id) === String(auditId));
    if (audit) {
      const typeLabel = reportTypes.find(rt => rt.id === selectedReportType)?.label || t('reports.auditReport');
      setReportTitle(`${typeLabel}: ${audit.title}`);
      setReportSummary('');
    }
    
    try {
      const auditFindings = await reportService.fetchAuditFindings(auditId);
      setFindings(auditFindings);
      setSelectedFindings(auditFindings.map(f => f.id!));
    } catch (err) {
      console.error(err);
    }
  };

  const toggleFinding = (id: string | number) => {
    setSelectedFindings(prev => 
      prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id]
    );
  };

  const handleReportTypeSelect = (typeId: string) => {
    setSelectedReportType(typeId);
    const typeLabel = reportTypes.find(rt => rt.id === typeId)?.label || '';
    setReportSummary('');
    
    if (selectedAuditId) {
      const audit = audits.find(a => a.id === selectedAuditId);
      if (audit) {
        setReportTitle(`${typeLabel}: ${audit.title}`);
      }
    } else if (typeId !== 'auditReport') {
      setReportTitle(typeLabel);
    }
  };

  const generateAuditPDF = async () => {
    if (selectedReportType === 'quarterlyReport') {
      try {
        const { generateQuarterlyReportDocx } = await import('../../../utils/docxExport');
        await generateQuarterlyReportDocx({
          auditId: selectedAuditId,
          title: reportTitle,
          findings: findings.filter(f => selectedFindings.includes(f.id!))
        }, i18n.language as 'ar' | 'en');
      } catch (err) {
        console.error('Failed to generate docx:', err);
      }
      return;
    }

    const sections: any[] = [];
    let content = "";

    if (selectedAuditId) {
      const audit = audits.find(a => String(a.id) === String(selectedAuditId));
      if (audit) {
        content += `${t('plan.department')}: ${audit.department}\n`;
        content += `${t('plan.leadAuditor')}: ${audit.lead_auditor}\n\n`;
      }
    }
    
    const typeDesc = reportTypes.find(rt => rt.id === selectedReportType)?.description;
    if (typeDesc) {
      content += `${t('evidence.description')}:\n${typeDesc}\n\n`;
    }

    content += `${t('reports.executiveSummary')}:\n`;
    if (reportSummary) {
      content += `${reportSummary}\n\n`;
    } else if (selectedAuditId) {
      const audit = audits.find(a => String(a.id) === String(selectedAuditId));
      content += `${t('reports.reportSummaryText', { title: audit?.title || '' })}\n\n`;
    } else {
      content += `${typeDesc || t('reports.generalReportSummary')}\n\n`;
    }

    sections.push({ type: 'text', content });

    if (selectedFindings.length > 0) {
      const columns = [
        { header: t('plan.riskRating'), dataKey: 'risk' },
        { header: t('findings.title'), dataKey: 'finding' },
        { header: t('findings.recommendation'), dataKey: 'recommendation' },
        { header: t('common.statusLabel'), dataKey: 'status' }
      ];
      const tableData = findings
        .filter(f => selectedFindings.includes(f.id!))
        .map(f => ({
          risk: f.risk_level,
          finding: f.condition,
          recommendation: f.recommendation,
          status: f.status
        }));
      sections.push({ type: 'table', columns, data: tableData });
    }

    await generatePdf(reportTitle, sections, token, i18n.language as 'en' | 'ar', typeDesc ? (reportTypes.find(rt => rt.id === selectedReportType)?.label) : t('reports.auditReport'), {
      title: reportTitle,
      report_date: new Date().toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : 'en-US'),
      summary: reportSummary,
      findings: findings.filter(f => selectedFindings.includes(f.id!))
    });
  };

  const generateExecPDF = async () => {
    if (!execData) return;
    
    const sections: PdfSection[] = [];

    sections.push({
      type: 'table',
      title: t('reports.kpiTitle'),
      columns: [
        { header: t('reports.metric'), dataKey: 'metric' },
        { header: t('reports.value'), dataKey: 'value' }
      ],
      data: [
        { metric: t('reports.totalAudits'), value: execData.totalAudits },
        { metric: t('reports.completedAudits'), value: execData.completedAudits },
        { metric: t('reports.highRiskFindings'), value: execData.highRiskFindings }
      ]
    });

    sections.push({
      type: 'table',
      title: t('reports.topRisks'),
      columns: [
        { header: t('reports.riskDescription'), dataKey: 'description' },
        { header: t('plan.department'), dataKey: 'department' },
        { header: t('reports.rating'), dataKey: 'rating' }
      ],
      data: execData.topRisks.map(r => ({
        description: r.description,
        department: r.owner,
        rating: r.rating
      }))
    });

    sections.push({
      type: 'table',
      title: t('reports.findingsByDepartment'),
      columns: [
        { header: t('plan.department'), dataKey: 'department' },
        { header: t('reports.numberOfFindings'), dataKey: 'count' }
      ],
      data: execData.findingsByDept.map(f => ({
        department: f.department,
        count: f.count
      }))
    });

    await generatePdf(t('reports.executiveSummaryReportTitle'), sections, token, i18n.language as 'en' | 'ar', t('reports.generalReport'), {
      title: t('reports.executiveSummaryReportTitle'),
      report_date: new Date().toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : 'en-US'),
      kpi: execData
    });
  };

  const saveReport = async () => {
    if (!reportTitle) return;
    
    const reportData: Partial<AuditReport> = {
      audit_id: selectedAuditId || undefined,
      title: reportTitle,
      report_type: selectedReportType,
      generated_by: user?.username || 'Unknown',
      date_generated: new Date().toISOString().split('T')[0],
      status: 'Final',
      content: JSON.stringify({
        selectedFindings,
        findingsCount: selectedFindings.length,
        reportType: selectedReportType
      })
    };

    try {
      await reportService.saveReport(reportData);
      setIsModalOpen(false);
      fetchReports();
      generateAuditPDF();
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDelete = async () => {
    if (itemToDelete === null) return;
    try {
      await reportService.deleteReport(itemToDelete);
      fetchReports();
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredReports = reports.filter(report => {
    const audit = audits.find(a => String(a.id) === String(report.audit_id));
    const matchesSearch = report.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = !deptFilter || audit?.department === deptFilter;
    const matchesStatus = !statusFilter || report.status === statusFilter;
    const matchesRisk = !riskFilter || audit?.risk_rating === riskFilter;
    return matchesSearch && matchesDept && matchesStatus && matchesRisk;
  });

  const downloadExistingReport = async (report: AuditReport) => {
    if (report.report_type === 'quarterlyReport') {
      try {
        const { generateQuarterlyReportDocx } = await import('../../../utils/docxExport');
        let contentData: any = {};
        try {
          contentData = JSON.parse(report.content || '{}');
        } catch (e) {}
        
        await generateQuarterlyReportDocx({
          auditId: report.audit_id,
          title: report.title,
          findings: [] // We might not have the full findings here, but we can pass what we have
        }, i18n.language as 'ar' | 'en');
      } catch (err) {
        console.error('Failed to generate docx:', err);
        setError(t('reports.failedToGenerateDocument'));
      }
      return;
    }
    
    // Fallback for other reports
    setError(t('reports.regenerateFromAuditPlan'));
  };

  return {
    reports,
    audits,
    loading,
    execData,
    execLoading,
    error,
    setError,
    isModalOpen,
    setIsModalOpen,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    isScheduleModalOpen,
    setIsScheduleModalOpen,
    itemToDelete,
    setItemToDelete,
    searchQuery,
    setSearchQuery,
    deptFilter,
    setDeptFilter,
    statusFilter,
    setStatusFilter,
    riskFilter,
    setRiskFilter,
    reportTypes,
    selectedAuditId,
    setSelectedAuditId,
    findings,
    setFindings,
    selectedFindings,
    reportTitle,
    setReportTitle,
    reportSummary,
    setReportSummary,
    selectedReportType,
    handleAuditSelect,
    toggleFinding,
    handleReportTypeSelect,
    generateAuditPDF,
    generateExecPDF,
    saveReport,
    confirmDelete,
    downloadExistingReport,
    filteredReports,
    fetchReports,
    fetchExecData
  };
};
