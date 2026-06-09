import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Plus, 
  Download, 
  BarChart3, 
  Calendar,
  LayoutDashboard,
  FileBarChart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart, 
  Pie, 
  Cell,
  Tooltip,
  Legend
} from 'recharts';
import ChartContainer from '../../components/ChartContainer';
import { useFormat } from '../../utils/formatService';
import Modal from '../../components/Modal';

// Refactored Assets
import { useReports } from './hooks/useReports';
import KPICards from './components/KPICards';
import ExecutiveCharts from './components/ExecutiveCharts';
import TopRisksList from './components/TopRisksList';
import ReportFilters from './components/ReportFilters';
import AuditReportCard from './components/AuditReportCard';
import ReportFormModal from './components/ReportFormModal';
import ScheduleReportModal from './components/ScheduleReportModal';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const Reports: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { formatNumber } = useFormat();
  const language = i18n.language;
  const [activeSubTab, setActiveSubTab] = useState<'audit' | 'executive'>('executive');
  
  const {
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
    filteredReports
  } = useReports(activeSubTab);

  const departments = Array.from(new Set(audits.map(a => a.department)));

  const handleCardClick = (tab: 'audit' | 'executive', filter: string, value: string) => {
    setActiveSubTab(tab);
    if (filter === 'status') setStatusFilter(value);
    if (filter === 'risk') setRiskFilter(value);
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <BarChart3 size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('reports.title')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('reports.executiveSubtitle')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 p-1.5 bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)]">
          <button 
            onClick={() => setActiveSubTab('executive')}
            className={`px-6 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${activeSubTab === 'executive' ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/20' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)]'}`}
          >
            <LayoutDashboard size={16} />
            {t('reports.executiveReports')}
          </button>
          <button 
            onClick={() => setActiveSubTab('audit')}
            className={`px-6 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${activeSubTab === 'audit' ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/20' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)]'}`}
          >
            <FileBarChart size={16} />
            {t('reports.auditReports')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-xl border border-[var(--color-danger)]/20 font-bold text-sm">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeSubTab === 'executive' ? (
          <motion.div 
            key="executive"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-10"
          >
            {execLoading || !execData ? (
              <div className="p-20 text-center text-[var(--color-text-muted)] font-bold">{t('reports.loadingAnalytics')}</div>
            ) : (
              <>
                <div className="flex justify-end gap-4">
                  <button 
                    onClick={() => {
                      setIsScheduleModalOpen(true);
                      setError(null);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-[var(--color-bg-main)] text-[var(--color-text-main)] text-xs font-bold uppercase tracking-wider hover:bg-[var(--color-border-soft)] transition-all flex items-center gap-2 border border-[var(--color-border-soft)]"
                  >
                    <Calendar size={18} />
                    {t('reports.scheduleReport')}
                  </button>
                  <Button 
                    onClick={generateExecPDF}
                    className="flex items-center gap-2"
                  >
                    <Download size={20} />
                    {t('reports.generateExecutiveReport')}
                  </Button>
                </div>

                <KPICards execData={execData} onCardClick={handleCardClick} />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <ExecutiveCharts execData={execData} language={language} />
                  <TopRisksList risks={execData.topRisks} />

                  <div className="glass-card p-8">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-warning)]/10 text-[var(--color-warning)] flex items-center justify-center">
                        <LayoutDashboard size={20} />
                      </div>
                      <h3 className="text-xl font-bold text-[var(--color-text-main)]">{t('reports.riskDistribution')}</h3>
                    </div>
                    <div className="h-64 w-full min-w-0">
                      <ChartContainer debugName="RiskDistributionChart" minHeight={256}>
                        {(width, height) => (
                          <PieChart width={width} height={height}>
                            <Pie
                              data={execData.findingsByDept}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="count"
                              nameKey="department"
                              stroke="none"
                            >
                              {execData.findingsByDept.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: any, name: any) => [formatNumber(value), t(`plan.${(name || '').toString().toLowerCase()}`)]}
                              contentStyle={{ 
                                borderRadius: '1rem', 
                                border: '1px solid var(--color-border-soft)', 
                                backgroundColor: 'var(--color-card)',
                                color: 'var(--color-text-main)',
                                direction: language === 'ar' ? 'rtl' : 'ltr'
                              }}
                            />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-text-muted)' }} />
                          </PieChart>
                        )}
                      </ChartContainer>
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="audit"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <ReportFilters 
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                deptFilter={deptFilter}
                setDeptFilter={setDeptFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                riskFilter={riskFilter}
                setRiskFilter={setRiskFilter}
                departments={departments}
              />
              <Button 
                onClick={() => {
                  setSelectedAuditId(null);
                  setFindings([]);
                  setReportTitle('');
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-2 shrink-0"
              >
                <Plus size={20} />
                {t('reports.newReport')}
              </Button>
            </div>

            {loading ? (
              <div className="p-20 text-center text-[var(--color-text-muted)] font-bold">{t('reports.loadingReports')}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(Array.isArray(filteredReports) ? filteredReports : []).map((report) => (
                  <AuditReportCard 
                    key={report.id}
                    report={report}
                    reportTypes={reportTypes}
                    onDownload={downloadExistingReport}
                    onDelete={(id) => {
                      setItemToDelete(id);
                      setIsDeleteModalOpen(true);
                    }}
                  />
                ))}
                {reports.length === 0 && (
                  <div className="col-span-full py-20 text-center glass-card border-dashed">
                    <FileText size={48} className="mx-auto text-[var(--color-border-soft)] mb-4" />
                    <p className="text-[var(--color-text-muted)] font-bold">{t('reports.noReportsYet')}</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        title={t('plan.deleteConfirm')}
      >
        <div className="space-y-6">
          <p className="text-[var(--color-text-main)] font-medium">
            {t('reports.deleteReportMessage')}
          </p>
          <div className="flex justify-end gap-4">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setItemToDelete(null);
              }}
              className="px-6 py-3 rounded-2xl bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-bold hover:bg-[var(--color-border-soft)] transition-colors border border-[var(--color-border-soft)]"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={confirmDelete}
              className="px-6 py-3 rounded-2xl bg-[var(--color-danger)] text-white font-bold hover:bg-[var(--color-danger)]/90 transition-colors shadow-lg shadow-[var(--color-danger)]/20"
            >
              {t('common.delete')}
            </button>
          </div>
        </div>
      </Modal>

      <ReportFormModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        reportTypes={reportTypes}
        selectedReportType={selectedReportType}
        onReportTypeSelect={handleReportTypeSelect}
        audits={audits}
        selectedAuditId={selectedAuditId}
        onAuditSelect={handleAuditSelect}
        reportTitle={reportTitle}
        setReportTitle={setReportTitle}
        reportSummary={reportSummary}
        setReportSummary={setReportSummary}
        findings={findings}
        selectedFindings={selectedFindings}
        onToggleFinding={toggleFinding}
        onPreview={generateAuditPDF}
        onSave={saveReport}
      />

      <ScheduleReportModal 
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        reportTypes={reportTypes}
        onSchedule={() => {
          setError(t('reports.reportScheduledSuccess'));
          setIsScheduleModalOpen(false);
        }}
      />
    </div>
  );
};

export default Reports;
