import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ClipboardList, 
  AlertTriangle, 
  FileText, 
  ShieldCheck, 
  Plus, 
  ArrowRight, 
  Upload, 
  CheckCircle2,
  Clock,
  User,
  ChevronRight,
  Search,
  MessageSquare,
  Link as LinkIcon
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import FindingForm from '../components/FindingForm';
import { AuditStatus, RiskLevel } from '../constants';

interface AuditWorkspaceProps {
  planId: string | number;
  onClose: () => void;
}

const AuditWorkspace: React.FC<AuditWorkspaceProps> = ({ planId, onClose }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [activeTask, setActiveTask] = useState<any>(null);
  const [isFindingModalOpen, setIsFindingModalOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<any>(null);
  const [currentFindingIndex, setCurrentFindingIndex] = useState(0);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const nextFinding = () => {
    if (findings.length === 0) return;
    setCurrentFindingIndex((prev) => (prev + 1) % findings.length);
  };

  const prevFinding = () => {
    if (findings.length === 0) return;
    setCurrentFindingIndex((prev) => (prev - 1 + findings.length) % findings.length);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [planRes, tasksRes, findingsRes, evidenceRes] = await Promise.all([
        api.get(`/audit-plans/${planId}`),
        api.get(`/audit-tasks?plan_id=${planId}`),
        api.get(`/audit-findings?audit_id=${planId}`),
        api.get(`/audit-evidence?audit_id=${planId}`)
      ]);

      const planData = planRes?.data?.data || planRes?.data;
      const tasksData = tasksRes?.data?.data || tasksRes?.data;
      const findingsData = findingsRes?.data?.data || findingsRes?.data;
      const evidenceData = evidenceRes?.data?.data || evidenceRes?.data;

      setPlan(planData);
      const tasksArray = Array.isArray(tasksData) ? tasksData : [];
      setTasks(tasksArray);
      setFindings(Array.isArray(findingsData) ? findingsData : []);
      setEvidence(Array.isArray(evidenceData) ? evidenceData : []);
      
      if (tasksArray.length > 0 && !activeTask) {
        setActiveTask(tasksArray[0]);
      }
    } catch (error) {
      console.error('Error fetching audit data:', error);
      toast.error(t('errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [planId]);

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    setIsUpdatingStatus(true);
    try {
      await api.patch(`/audit-tasks/${taskId}/status`, { status: newStatus });
      toast.success(t('statusUpdated'));
      await fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('errorOccurred'));
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const isRTL = i18n.language === 'ar';

  if (loading && !plan) {
    return (
      <div className="fixed inset-0 bg-[var(--color-card)] z-[60] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[var(--color-bg-main)] z-[60] flex flex-col">
      {/* Header */}
      <div className="h-20 bg-[var(--color-card)] border-b border-[var(--color-border-soft)] px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-[var(--color-bg-main)] flex items-center justify-center transition-colors"
          >
            <ArrowRight size={20} className={isRTL ? '' : 'rotate-180'} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text-main)]">{plan?.title}</h2>
            <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{plan?.plan_code} • {plan?.department}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge type="status" value={plan?.status} />
          <div className="w-px h-6 bg-slate-200 mx-2" />
          <button className="btn-primary !py-2 !px-4 text-xs">
            {t('common.completeAudit')}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Tasks */}
        <div className="w-80 bg-[var(--color-card)] border-e border-[var(--color-border-soft)] flex flex-col">
          <div className="p-6 border-b border-[var(--color-border-soft)]">
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-4">{t('planTasks')}</h3>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={14} />
              <input 
                type="text" 
                placeholder={t('common.search')}
                className="w-full bg-[var(--color-bg-soft)] border-none rounded-xl py-2 ps-10 text-xs font-bold focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => setActiveTask(task)}
                className={`w-full text-start p-4 rounded-2xl transition-all group ${
                  activeTask?.id === task.id 
                    ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20' 
                    : 'hover:bg-[var(--color-bg-soft)] text-[var(--color-text-muted)]'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${activeTask?.id === task.id ? 'text-white/70' : 'text-[var(--color-text-muted)]'}`}>
                    {task.task_number}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${
                    task.status === 'completed' ? 'bg-emerald-400' : 
                    task.status === 'in_progress' ? 'bg-blue-400' : 'bg-slate-300'
                  }`} />
                </div>
                <p className="text-xs font-bold leading-tight line-clamp-2">{task.title}</p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <User size={10} className={activeTask?.id === task.id ? 'text-white/70' : 'text-[var(--color-text-muted)]'} />
                    <span className="text-[9px] font-bold opacity-70">{task.assigned_name || t('common.unassigned')}</span>
                  </div>
                  <ChevronRight size={14} className={`transition-transform ${isRTL ? 'rotate-180' : ''} ${activeTask?.id === task.id ? (isRTL ? '-translate-x-1' : 'translate-x-1') : 'opacity-0 group-hover:opacity-100'}`} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content: Middle (Execution) & Right (Findings/Evidence) */}
        <div className="flex-1 flex bg-[var(--color-bg-soft)] overflow-hidden">
          {/* Execution Area */}
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-8">
            {activeTask ? (
              <>
                <div className="bg-[var(--color-card)] rounded-2xl p-8 shadow-sm border border-[var(--color-border-soft)]">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-2xl font-bold text-[var(--color-text-main)] mb-2">{activeTask.title}</h3>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{activeTask.audit_type}</span>
                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="text-xs font-bold text-[var(--color-text-muted)]">{t('common.assignedTo')}: {activeTask.assigned_name}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                       {activeTask?.status === 'draft' && (
                         <button 
                           onClick={() => handleUpdateTaskStatus(activeTask.id, 'in_progress')}
                           disabled={isUpdatingStatus}
                           className="btn-primary !py-2 !px-6 text-xs flex items-center gap-2 disabled:opacity-50"
                         >
                           {isUpdatingStatus ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Clock size={16} />} 
                           {t('common.startTask')}
                         </button>
                       )}
                       {activeTask?.status === 'in_progress' && (
                         <button 
                           onClick={() => handleUpdateTaskStatus(activeTask.id, 'review')}
                           disabled={isUpdatingStatus}
                           className="btn-warning !py-2 !px-6 text-xs flex items-center gap-2 disabled:opacity-50"
                         >
                           {isUpdatingStatus ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ShieldCheck size={16} />} 
                           {t('common.moveToReview')}
                         </button>
                       )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 text-sm">
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest border-b border-slate-50 pb-2">{t('common.details')}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.startDate')}</p>
                          <p className="font-bold text-[var(--color-text-main)]">{activeTask?.period_from || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.endDate')}</p>
                          <p className="font-bold text-[var(--color-text-main)]">{activeTask?.period_to || '—'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest border-b border-slate-50 pb-2">{t('common.progress')}</h4>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-2 bg-[var(--color-bg-main)] rounded-full overflow-hidden">
                           <div className={`h-full rounded-full ${activeTask?.status === 'completed' ? 'bg-emerald-500 w-full' : 'bg-[var(--color-primary-light)]0 w-1/2'}`} />
                        </div>
                        <span className="text-xs font-bold text-[var(--color-text-main)]">{activeTask?.status === 'completed' ? '100%' : '50%'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Observations & Work Done */}
                <div className="grid grid-cols-1 gap-8">
                  <div className="bg-[var(--color-card)] rounded-2xl p-8 shadow-sm border border-[var(--color-border-soft)]">
                    <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500">
                          <AlertTriangle size={20} />
                        </div>
                        <h4 className="text-lg font-bold text-[var(--color-text-main)]">{t('common.findingsAndObservations')}</h4>
                      </div>
                      <button 
                         onClick={() => {
                           setSelectedFinding(null);
                           setIsFindingModalOpen(true);
                         }}
                         className="flex items-center gap-2 text-[var(--color-primary)] font-bold text-xs hover:bg-[var(--color-primary)]/5 px-4 py-2 rounded-xl transition-colors"
                      >
                        <Plus size={16} /> {t('common.addObservation')}
                      </button>
                    </div>

                    <div className="relative mt-4">
                      {findings.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-[var(--color-border-strong)] border-2 border-dashed border-slate-50 rounded-3xl">
                          <MessageSquare size={48} className="mb-4 opacity-20" />
                          <p className="text-sm font-bold">{t('common.noFindingsYet')}</p>
                        </div>
                      ) : (
                        <div className="relative overflow-hidden w-full bg-[var(--color-bg-soft)] border border-[var(--color-border-soft)] rounded-2xl p-6 h-[200px]">
                          <AnimatePresence mode="wait">
                            {findings.length > 0 && (
                              <motion.div
                                key={currentFindingIndex}
                                initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: isRTL ? 20 : -20 }}
                                transition={{ duration: 0.3 }}
                                className="absolute inset-0 p-6 flex flex-col h-full"
                              >
                                <div className="flex justify-between items-start mb-4">
                                  <h5 className="font-bold text-[var(--color-text-main)] text-lg line-clamp-1">{findings[currentFindingIndex].title}</h5>
                                  <Badge type="risk" value={findings[currentFindingIndex].risk_level} />
                                </div>
                                <p className="text-sm text-[var(--color-text-muted)] line-clamp-3 mb-auto leading-relaxed">{findings[currentFindingIndex].description}</p>
                                <div className="flex flex-row items-center justify-between mt-4 border-t border-[var(--color-border-soft)]/50 pt-4">
                                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest bg-[var(--color-card)] px-3 py-1 rounded-full shadow-sm">
                                    {findings[currentFindingIndex].status}
                                  </span>
                                  <button 
                                    onClick={() => {
                                      setSelectedFinding(findings[currentFindingIndex]);
                                      setIsFindingModalOpen(true);
                                    }}
                                    className="text-[var(--color-primary)] text-xs font-bold uppercase tracking-widest hover:underline"
                                  >
                                    {t('common.edit')}
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          
                          {/* Navigation Controls */}
                          {findings.length > 1 && (
                            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2 w-full pointer-events-none">
                              <button 
                                onClick={isRTL ? nextFinding : prevFinding}
                                className="w-8 h-8 rounded-full bg-[var(--color-card)] shadow-md flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-bg-soft)] transition-colors pointer-events-auto"
                              >
                                <ChevronRight size={18} className="rotate-180" />
                              </button>
                              <button 
                                onClick={isRTL ? prevFinding : nextFinding}
                                className="w-8 h-8 rounded-full bg-[var(--color-card)] shadow-md flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-bg-soft)] transition-colors pointer-events-auto"
                              >
                                <ChevronRight size={18} />
                              </button>
                            </div>
                          )}

                          {/* Pagination Indicators */}
                          {findings.length > 1 && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                              {findings.map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setCurrentFindingIndex(idx)}
                                  className={`h-1.5 rounded-full transition-all ${idx === currentFindingIndex ? 'w-4 bg-[var(--color-primary)]' : 'w-1.5 bg-slate-300'}`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)] space-y-4">
                <ClipboardList size={64} className="opacity-20" />
                <p className="text-lg font-bold uppercase tracking-widest">{t('common.selectTaskToExecute')}</p>
              </div>
            )}
          </div>

          {/* Right Sidebar: Evidence & Links */}
          <div className="w-96 bg-[var(--color-card)] border-s border-[var(--color-border-soft)] flex flex-col p-6">
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-6">{t('common.evidenceAndAttachments')}</h3>
            
            <div className="mb-8">
              <div className="p-8 border-2 border-dashed border-[var(--color-border-soft)] rounded-2xl flex flex-col items-center justify-center text-center group hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5 transition-all cursor-pointer">
                <div className="w-12 h-12 bg-[var(--color-bg-soft)] rounded-2xl flex items-center justify-center text-[var(--color-text-muted)] mb-4 group-hover:bg-[var(--color-primary)] group-hover:text-white transition-all">
                  <Upload size={24} />
                </div>
                <p className="text-xs font-bold text-[var(--color-text-main)] mb-1">{t('common.uploadEvidence')}</p>
                <p className="text-[10px] font-medium text-[var(--color-text-muted)]">{t('common.dragAndDropFile')}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
              <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest border-b border-slate-50 pb-2">{t('common.recentEvidence')}</h4>
              {evidence.length === 0 ? (
                <p className="text-[10px] font-bold text-[var(--color-border-strong)] text-center py-8 italic">{t('common.noEvidenceUploaded')}</p>
              ) : (
                evidence.map((item) => (
                  <div key={item.id} className="p-3 rounded-2xl bg-[var(--color-bg-soft)] flex items-center gap-3 group">
                    <div className="w-10 h-10 bg-[var(--color-card)] rounded-xl flex items-center justify-center text-blue-500 shadow-sm">
                      <FileText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-main)] truncate">{item.file_name}</p>
                      <p className="text-[9px] font-medium text-[var(--color-text-muted)] underline">{item.type || 'General'}</p>
                    </div>
                    <button className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-main)] flex items-center justify-center text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus size={14} />
                    </button>
                  </div>
                ))
              )}

              <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest border-b border-slate-50 pb-2 mt-8">{t('common.linkedRecommendations')}</h4>
              {findings.map(f => (
                <div key={`rec-${f.id}`} className="space-y-2">
                  <div className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100/50">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <p className="text-[10px] font-bold text-emerald-800 line-clamp-1">{t('common.recommendationFor')}: {f.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Modal 
        isOpen={isFindingModalOpen}
        onClose={() => setIsFindingModalOpen(false)}
        title={selectedFinding ? t('findings.editFinding') : t('findings.addFinding')}
      >
        <FindingForm 
          onSuccess={() => {
            setIsFindingModalOpen(false);
            fetchData();
          }}
          onCancel={() => setIsFindingModalOpen(false)}
          initialData={selectedFinding ? { ...selectedFinding, audit_id: planId } : { audit_id: planId }}
        />
      </Modal>
    </div>
  );
};

export default AuditWorkspace;
