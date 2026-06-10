import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { useUser } from '../../../context/UserContext';
import { useAppContext } from '../../../context/AppContext';
import { AuditReport, AuditPlan, AuditFinding, ExecData, ReportType } from '../types';
import * as reportService from '../services/reportService';
import api from '../../../api/httpClient';
import { pollReportStatus, ReportStatusResponse } from '../../../utils/pollReportStatus';

/**
 * Maps the legacy camelCase report type IDs used in the frontend
 * to the canonical snake_case TemplateTypeKey used by the server.
 */
const REPORT_TYPE_KEY_MAP: Record<string, string> = {
  auditReport: 'audit_report',
  quarterlyReport: 'quarterly_report',
  complianceRequirements: 'audit_report',
  activityAuditResults: 'audit_report',
  eventParticipationSummary: 'general',
  monthlyDepartmentReport: 'quarterly_report',
};

function resolveTemplateTypeKey(input: string | null | undefined): string {
  if (!input) return 'general';
  // Already a valid snake_case key
  if (input.includes('_')) return input;
  return REPORT_TYPE_KEY_MAP[input] || 'general';
}

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

  // Report generation status (server-side PDF)
  const [reportGenerationStatus, setReportGenerationStatus] = useState<
    'idle' | 'pending' | 'ready' | 'failed'
  >('idle');
  const [reportGenerationId, setReportGenerationId] = useState<string | null>(null);

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
    // DOCX export path remains client-side (separate workflow)
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
        setError(t('reports.failedToGenerateDocument'));
      }
      return;
    }

    // Server-side PDF generation via POST /reports/generate
    try {
      setReportGenerationStatus('pending');
      setError(null);

      const templateTypeKey = resolveTemplateTypeKey(selectedReportType);

      const response = await api.post('/reports/generate', {
        auditId: selectedAuditId,
        templateTypeKey,
        title: reportTitle,
        findings: findings.filter(f => selectedFindings.includes(f.id!)),
      });

      const { reportId, downloadUrl } = response.data;

      if (downloadUrl) {
        // Synchronous result — PDF was generated immediately
        setReportGenerationStatus('ready');
        window.open(downloadUrl);
      } else if (reportId) {
        // Asynchronous — poll for status
        setReportGenerationId(reportId);
        pollReportStatus(
          reportId,
          (url) => {
            setReportGenerationStatus('ready');
            setReportGenerationId(null);
            window.open(url);
          },
          (errorMsg) => {
            setReportGenerationStatus('failed');
            setReportGenerationId(null);
            setError(errorMsg);
          },
          {
            onStatusUpdate: (status: ReportStatusResponse) => {
              if (status.status === 'pending') {
                setReportGenerationStatus('pending');
              }
            },
          }
        );
      }
    } catch (err: unknown) {
      setReportGenerationStatus('failed');
      const message =
        err instanceof Error ? err.message : t('reports.failedToGenerateDocument');
      setError(message);
      console.error('Failed to generate PDF:', err);
    }
  };

  const generateExecPDF = async () => {
    if (!execData) return;

    // Server-side PDF generation for executive summary
    try {
      setReportGenerationStatus('pending');
      setError(null);

      const response = await api.post('/reports/generate', {
        auditId: null,
        templateTypeKey: 'general',
        title: t('reports.executiveSummaryReportTitle'),
        executiveData: execData,
      });

      const { reportId, downloadUrl } = response.data;

      if (downloadUrl) {
        setReportGenerationStatus('ready');
        window.open(downloadUrl);
      } else if (reportId) {
        setReportGenerationId(reportId);
        pollReportStatus(
          reportId,
          (url) => {
            setReportGenerationStatus('ready');
            setReportGenerationId(null);
            window.open(url);
          },
          (errorMsg) => {
            setReportGenerationStatus('failed');
            setReportGenerationId(null);
            setError(errorMsg);
          },
          {
            onStatusUpdate: (status: ReportStatusResponse) => {
              if (status.status === 'pending') {
                setReportGenerationStatus('pending');
              }
            },
          }
        );
      }
    } catch (err: unknown) {
      setReportGenerationStatus('failed');
      const message =
        err instanceof Error ? err.message : t('reports.failedToGenerateDocument');
      setError(message);
      console.error('Failed to generate executive PDF:', err);
    }
  };

  const saveReport = async () => {
    if (!reportTitle) return;
    
    const reportData: Partial<AuditReport> = {
      ...(selectedAuditId ? { audit_id: selectedAuditId } : {}),
      title: reportTitle,
      report_type: selectedReportType,
      generated_by: user?.username || 'Unknown',
      date_generated: new Date().toISOString().split('T')[0] ?? '',
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
    fetchExecData,
    // Server-side PDF generation status
    reportGenerationStatus,
    reportGenerationId,
  };
};
