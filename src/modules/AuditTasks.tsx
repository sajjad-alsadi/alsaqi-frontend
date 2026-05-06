import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../context/AppContext';
import api from '../services/api';
import { useTranslation } from 'react-i18next';
import { AuditTask, AuditPlan, AuditEvidence as AuditEvidenceType } from '../types';
import { Plus, Search, Download, MoreVertical, CheckCircle2, Clock, AlertCircle, Edit, Trash2, FileText, Eye } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { generatePdf, PdfSection } from '../utils/pdfExport';
import InteractiveIcon from '../components/InteractiveIcon';
import { useFormat } from '../services/formatService';
import { useDebounce } from '../hooks/useDebounce';
import { AuditStatus } from '../constants';

import Modal from '../components/Modal';
import AuditTaskForm from '../components/AuditTaskForm';
import PdfViewer from '../components/PdfViewer';
import Pagination from '../components/Pagination';
import AuditTasksTable from '../components/AuditTasksTable';

const AuditTasksModule: React.FC = () => {
  const { token } = useAppContext();
  const { t, i18n } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15 });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AuditTask | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | number | null>(null);
  const [previewItem, setPreviewItem] = useState<AuditEvidenceType | null>(null);

  const { data: tasksData, isLoading: loadingTasks } = useQuery({
    queryKey: ['audit-tasks', pagination.page, pagination.pageSize, debouncedSearchTerm],
    queryFn: async () => {
      const res = await api.get('/audit-tasks', {
        params: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          search: debouncedSearchTerm || undefined
        }
      });
      return res.data;
    }
  });

  const tasks = Array.isArray(tasksData?.data) ? tasksData.data : (Array.isArray(tasksData) ? tasksData : []);
  const totalItems = tasksData?.pagination?.total || 0;
  const totalPages = tasksData?.pagination?.totalPages || 0;

  const { data: plans = [] } = useQuery({
    queryKey: ['audit-plans'],
    queryFn: async () => {
      const res = await api.get('/audit-plans');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    }
  });

  const { data: evidenceList = [] } = useQuery({
    queryKey: ['audit-evidence'],
    queryFn: async () => {
      const res = await api.get('/audit-evidence');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    }
  });

  const loading = loadingTasks;

  const handleAddSuccess = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    toast.success(editingTask ? t('updateSuccess') : t('createSuccess'));
    queryClient.invalidateQueries({ queryKey: ['audit-tasks'] });
  };

  const handleEdit = (task: AuditTask) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const initiateDelete = (id: string | number) => {
    setTaskToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    try {
      await api.delete(`/audit-tasks/${taskToDelete}`);
      toast.success(t('deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['audit-tasks'] });
      setIsDeleteModalOpen(false);
      setTaskToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error(t('errorOccurred'));
    }
  };

  const updateStatus = async (id: string | number, newStatus: string) => {
    try {
      await api.patch(`/audit-tasks/${id}/status`, { status: newStatus });
      toast.success(t('tasks.statusUpdateSuccess'));
      queryClient.invalidateQueries({ queryKey: ['audit-tasks'] });
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || t('errorOccurred'));
    }
  };

  const exportPDF = async () => {
    const sections: PdfSection[] = [{
      type: 'table',
      columns: [
        { header: t('common.id'), dataKey: 'id' },
        { header: t('tasks.procedure'), dataKey: 'procedure' },
        { header: t('tasks.responsible'), dataKey: 'responsible' },
        { header: t('common.statusLabel'), dataKey: 'status' }
      ],
      data: tasks.map(task => ({
        id: task.id,
        procedure: task.procedure,
        responsible: task.responsible,
        status: task.status
      }))
    }];

    await generatePdf(t('tasks.title'), sections, token, (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en', 'مهام التدقيق', {
      title: t('tasks.title'),
      report_date: new Date().toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : 'en-US'),
      tasks: filteredTasks
    });
  };

  const getPlanTitle = (id: string | number) => {
    return plans.find(p => String(p.id) === String(id))?.title || `${t('common.auditPlan')} #${formatNumber(id)}`;
  };

  const getEvidence = (id?: string | number) => {
    if (!id) return null;
    return evidenceList.find(e => String(e.id) === String(id));
  };

  const filteredTasks = tasks;

  return (
    <div className="space-y-10">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
            <CheckCircle2 size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-slate-800 tracking-tight">{t('tasks.title')}</h2>
            <p className="text-sm text-slate-400 font-bold mt-2">{t('tasks.detailedAuditProcedures')}</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute start-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder={t('common.search')}
              className="input-field !ps-14"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            <InteractiveIcon 
              icon={Download}
              onClick={exportPDF}
              tooltip={t('common.exportPdf')}
              variant="outline"
              className="!w-14 !h-14 !rounded-[1.5rem]"
              size={24}
            />
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setEditingTask(null);
                setIsModalOpen(true);
              }}
              className="btn-primary flex items-center justify-center gap-3 whitespace-nowrap"
            >
              <Plus size={24} />
              <span>{t('plan.add')}</span>
            </motion.button>
          </div>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }} 
        title={editingTask ? t('tasks.editTask') : t('tasks.addTask')}
      >
        <AuditTaskForm 
          onSuccess={handleAddSuccess} 
          onCancel={() => {
            setIsModalOpen(false);
            setEditingTask(null);
          }} 
          plans={plans}
          initialData={editingTask}
        />
      </Modal>

      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => {
          setIsDeleteModalOpen(false);
          setTaskToDelete(null);
        }} 
        title={t('plan.deleteConfirm')}
      >
        <div className="space-y-6">
          <p className="text-slate-600 font-medium">
            {t('plan.deleteMessage')}
          </p>
          <div className="flex justify-end gap-4">
            <button 
              onClick={() => {
                setIsDeleteModalOpen(false);
                setTaskToDelete(null);
              }}
              className="px-6 py-3 rounded-[2rem] bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={confirmDelete}
              className="px-6 py-3 rounded-[2rem] bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200"
            >
              {t('common.delete')}
            </button>
          </div>
        </div>
      </Modal>

      {previewItem && (
        <Modal
          isOpen={!!previewItem}
          onClose={() => setPreviewItem(null)}
          title={previewItem.file_name}
          size="xl"
        >
          <div className="h-[70vh] flex flex-col bg-slate-100 rounded-[2rem] overflow-hidden">
            {previewItem.file_data?.startsWith('data:application/pdf') || /\.(pdf)$/i.test(previewItem.file_data || '') || (previewItem.file_data && !previewItem.file_data.startsWith('data:') && !previewItem.file_data.startsWith('http') && !previewItem.file_data.startsWith('/') && previewItem.file_data.length > 100) ? (
              <PdfViewer url={previewItem.file_data} />
            ) : previewItem.file_data?.startsWith('data:image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(previewItem.file_data || '') ? (
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
                <img src={previewItem.file_data} alt={previewItem.file_name} className="max-w-full max-h-full object-contain shadow-xl rounded-[1.5rem]" />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg mb-6">
                  <FileText size={48} className="text-slate-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">{t('tasks.previewNotAvailable')}</h3>
                <p className="text-slate-500 mb-8 max-w-md">{t('tasks.previewNotAvailableDesc')}</p>
                <a 
                  href={previewItem.file_data} 
                  download={previewItem.file_name}
                  className="btn-primary"
                >
                  {t('tasks.downloadFile')}
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}

      <div className="glass-card overflow-hidden">
        <AuditTasksTable 
          tasks={filteredTasks}
          getPlanTitle={getPlanTitle}
          getEvidence={getEvidence}
          setPreviewItem={setPreviewItem}
          handleEdit={handleEdit}
          initiateDelete={initiateDelete}
          updateStatus={updateStatus}
        />
      </div>

      <Pagination 
        currentPage={pagination.page}
        totalPages={totalPages}
        onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
        pageSize={pagination.pageSize}
        onPageSizeChange={(pageSize) => setPagination(prev => ({ ...prev, pageSize, page: 1 }))}
        totalItems={totalItems}
      />
    </div>
  );
};

export default AuditTasksModule;
