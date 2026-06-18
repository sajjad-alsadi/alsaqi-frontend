import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../context/UserContext';
import { useTranslation } from 'react-i18next';
import { AuditProgram, AuditProcedure } from '../types';
import { useFormat } from '../utils/formatService';
import api from '../api/httpClient';
import { AuditStatus, AuditType, ControlTestType } from '../constants';
import toast from 'react-hot-toast';
import logger from '../utils/logger';

// Sub-components
import AuditProgramHeader from './AuditProgram/AuditProgramHeader';
import AuditProgramGrid from './AuditProgram/AuditProgramGrid';
import AuditProgramEditor from './AuditProgram/AuditProgramEditor';
import AuditProgramProceduresModal from './AuditProgram/AuditProgramProceduresModal';
import Modal from '../components/Modal';
import { useDepartments } from '../api/hooks/useDepartments';

const AuditProgramLibrary: React.FC = () => {
  const { user } = useUser();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { formatDate } = useFormat();
  const queryClient = useQueryClient();
  
  const { data: programs = [], isLoading: loading } = useQuery({
    queryKey: ['audit-programs'],
    queryFn: async () => {
      const res = await api.get('/audit-programs');
      return (Array.isArray(res.data) ? res.data : (res.data.data || [])) as AuditProgram[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: instructions = [] } = useQuery({
    queryKey: ['compliance-instructions'],
    queryFn: async () => {
      const res = await api.get('/compliance?source_type=cbi_instruction');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    },
    staleTime: 30 * 60_000,
  });

  const { data: laws = [] } = useQuery({
    queryKey: ['compliance-laws'],
    queryFn: async () => {
      const res = await api.get('/compliance?source_type=law');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    },
    staleTime: 30 * 60_000,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentProgram, setCurrentProgram] = useState<Partial<AuditProgram> | null>(null);
  const [procedures, setProcedures] = useState<AuditProcedure[]>([]);
  const [isViewingProcedures, setIsViewingProcedures] = useState(false);
  const { departments } = useDepartments();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{id: string | number | null, type: 'program' | 'procedure'}>({id: null, type: 'program'});

  const fetchProcedures = async (programId: string | number) => {
    try {
      const res = await api.get(`/audit-procedures`, {
        params: { program_id: programId, pageSize: 500 }
      });
      const data = res.data.data || (Array.isArray(res.data) ? res.data : []);
      setProcedures(data);
    } catch (err) {
      logger.error('Operation failed', err);
    }
  };

  const handleSaveProgram = async () => {
    if (!currentProgram?.program_title || !currentProgram?.program_code || isSaving) return;
    
    setIsSaving(true);
    try {
      const data = {
        ...currentProgram,
        created_by: currentProgram.id ? currentProgram.created_by : user?.username,
        version_number: currentProgram.id ? currentProgram.version_number : 1,
        status: currentProgram.id ? currentProgram.status : AuditStatus.DRAFT
      };

      if (currentProgram.id) {
        try {
          await api.put(`/audit-programs/${currentProgram.id}`, data);
          toast.success(t('updateSuccess'));
        } catch (err: any) {
          if (err.response?.status === 404) {
            toast.error(t('program.programNotFound'));
            setIsEditing(false);
            queryClient.invalidateQueries({ queryKey: ['audit-programs'] });
            return;
          }
          throw err;
        }
      } else {
        const res = await api.post('/audit-programs', data);
        setCurrentProgram(res.data);
        toast.success(t('createSuccess'));
      }
      
      queryClient.invalidateQueries({ queryKey: ['audit-programs'] });
      setIsEditing(false);
    } catch (err) {
      logger.error('Operation failed', err);
      toast.error(t('errorOccurred'));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!showDeleteConfirm.id || isDeleting) return;
    
    const idToDelete = showDeleteConfirm.id;
    const deleteType = showDeleteConfirm.type;

    setIsDeleting(true);
    try {
      if (deleteType === 'program') {
        await api.delete(`/audit-programs/${idToDelete}`);
        queryClient.invalidateQueries({ queryKey: ['audit-programs'] });
      } else {
        await api.delete(`/audit-procedures/${idToDelete}`);
        setProcedures(prev => prev.filter(p => p.id !== idToDelete));
      }
      toast.success(t('deleteSuccess'));
      setShowDeleteConfirm({id: null, type: 'program'});
    } catch (err: any) {
      logger.error('Operation failed', err);
      // If it's 404, it might be already deleted, so we can treat it as success in UI
      if (err.response?.status === 404) {
        if (deleteType === 'procedure') {
          setProcedures(prev => prev.filter(p => p.id !== idToDelete));
        } else {
          queryClient.invalidateQueries({ queryKey: ['audit-programs'] });
        }
        toast.success(t('deleteSuccess'));
        setShowDeleteConfirm({id: null, type: 'program'});
      } else {
        toast.error(t('errorOccurred'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDuplicate = async (id: string | number) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await api.post(`/audit-programs/${id}/duplicate`, {});
      toast.success(t('createSuccess'));
      queryClient.invalidateQueries({ queryKey: ['audit-programs'] });
    } catch (err: any) {
      logger.error('Operation failed', err);
      if (err.response?.status === 404) {
        toast.error(t('program.programNotFound'));
        queryClient.invalidateQueries({ queryKey: ['audit-programs'] });
      } else {
        toast.error(t('errorOccurred'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async (id: string | number) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await api.post(`/audit-programs/${id}/approve`, {});
      toast.success(t('updateSuccess'));
      queryClient.invalidateQueries({ queryKey: ['audit-programs'] });
      setIsEditing(false);
    } catch (err: any) {
      logger.error('Operation failed', err);
      if (err.response?.status === 404) {
        toast.error(t('program.programNotFound'));
        setIsEditing(false);
        queryClient.invalidateQueries({ queryKey: ['audit-programs'] });
      } else {
        toast.error(t('errorOccurred'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddProcedure = async () => {
    if (!currentProgram?.id) return;
    
    const newProc: Partial<AuditProcedure> = {
      program_id: currentProgram.id,
      procedure_number: `${procedures.length + 1}`,
      audit_step: '',
      audit_test_description: '',
      risk_addressed: '',
      control_test_type: ControlTestType.WALKTHROUGH,
      expected_evidence: '',
      sampling_method: '',
      responsible_auditor: user?.username || ''
    };

    try {
      const res = await api.post('/audit-procedures', newProc);
      toast.success(t('createSuccess'));
      setProcedures([...procedures, res.data]);
    } catch (err) {
      logger.error('Operation failed', err);
      toast.error(t('errorOccurred'));
    }
  };

  const handleUpdateProcedure = async (id: string | number, data: Partial<AuditProcedure>) => {
    try {
      await api.put(`/audit-procedures/${id}`, data);
      setProcedures(prev => prev.map(p => String(p.id) === String(id) ? { ...p, ...data } : p));
    } catch (err: any) {
      logger.error('Operation failed', err);
      if (err.response?.status === 404) {
        toast.error(t('program.programNotFound'));
        setProcedures(prev => prev.filter(p => String(p.id) !== String(id)));
      }
    }
  };

  const filteredPrograms = Array.isArray(programs) ? programs.filter(p => {
    const matchesSearch = (p.program_title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                         (p.program_code?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (p.department?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'All' || p.audit_type === filterType;
    const matchesStatus = filterStatus === 'All' || p.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  }) : [];

  const auditTypes = Object.values(AuditType);
  const testTypes = Object.values(ControlTestType);

  return (
    <div className="space-y-10" dir={isRTL ? 'rtl' : 'ltr'}>
      {isEditing && currentProgram ? (
        <AuditProgramEditor
          program={currentProgram}
          procedures={procedures}
          auditTypes={auditTypes}
          testTypes={testTypes}
          instructions={instructions}
          laws={laws}
          user={user}
          onCancel={() => setIsEditing(false)}
          onSave={handleSaveProgram}
          onUpdateProgram={(data) => setCurrentProgram({ ...currentProgram, ...data })}
          onAddProcedure={handleAddProcedure}
          onUpdateProcedure={handleUpdateProcedure}
          onDeleteProcedure={(id) => setShowDeleteConfirm({ id, type: 'procedure' })}
          onApprove={handleApprove}
          isDeleting={isDeleting}
        />
      ) : (
        <>
          <AuditProgramHeader
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filterType={filterType}
            setFilterType={setFilterType}
            auditTypes={auditTypes}
            onAdd={() => {
              setCurrentProgram({});
              setProcedures([]);
              setIsEditing(true);
            }}
          />

          <AuditProgramGrid
            programs={filteredPrograms}
            formatDate={formatDate}
            onEdit={(program) => {
              setCurrentProgram(program);
              fetchProcedures(program.id!);
              setIsEditing(true);
            }}
            onDuplicate={handleDuplicate}
            onDelete={(id) => setShowDeleteConfirm({ id, type: 'program' })}
            onViewProcedures={(program) => {
              setCurrentProgram(program);
              fetchProcedures(program.id!);
              setIsViewingProcedures(true);
            }}
          />
        </>
      )}

      <Modal
        isOpen={!!showDeleteConfirm.id}
        onClose={() => setShowDeleteConfirm({ id: null, type: 'program' })}
        title={t(showDeleteConfirm.type === 'program' ? 'program.deleteConfirm' : 'program.deleteProcedureConfirm')}
        size="sm"
      >
        <div className="space-y-6">
          <p className="text-[var(--color-text-muted)]">{t(showDeleteConfirm.type === 'program' ? 'program.deleteMessage' : 'program.deleteProcedureMessage')}</p>
          <div className="flex justify-end gap-3">
            <button 
              onClick={() => setShowDeleteConfirm({ id: null, type: 'program' })}
              className="px-4 py-2 rounded-xl text-[var(--color-text-muted)] font-bold hover:bg-[var(--color-bg-main)] transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={confirmDelete}
              disabled={isDeleting}
              className={`px-6 py-2 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 shadow-lg shadow-rose-200 transition-all active:scale-95 ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isDeleting ? t('common.loading') : t('common.delete')}
            </button>
          </div>
        </div>
      </Modal>

      <AuditProgramProceduresModal
        isOpen={isViewingProcedures}
        program={currentProgram as AuditProgram}
        procedures={procedures}
        onClose={() => setIsViewingProcedures(false)}
      />
    </div>
  );
};

export default AuditProgramLibrary;
