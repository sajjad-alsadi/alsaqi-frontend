import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Clock, Search, Filter, MessageSquare, User, Mail, FileText } from 'lucide-react';
import { getContactAdminRequests, updateContactAdminRequestStatus, ContactAdminRequest } from '../../services/contactAdminService';

const SupportRequests: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [requests, setRequests] = useState<ContactAdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved' | 'rejected'>('all');

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await getContactAdminRequests();
      setRequests(data);
    } catch (error) {
      console.error('Error fetching support requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'resolved' | 'rejected') => {
    try {
      await updateContactAdminRequestStatus(id, status);
      fetchRequests(); // Refresh list
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.contactInfo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.ticketId?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-[var(--color-warning)]/10 text-[var(--color-warning)] flex items-center gap-1"><Clock size={12} /> {t('userManagement.supportRequests.pending')}</span>;
      case 'resolved':
        return <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-[var(--color-success)]/10 text-[var(--color-success)] flex items-center gap-1"><CheckCircle size={12} /> {t('userManagement.supportRequests.resolved')}</span>;
      case 'rejected':
        return <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-[var(--color-danger)]/10 text-[var(--color-danger)] flex items-center gap-1"><XCircle size={12} /> {t('userManagement.supportRequests.rejected')}</span>;
      default:
        return null;
    }
  };

  const getRequestTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      newAccount: t('auth.contactAdminModal.requestTypes.newAccount'),
      loginProblem: t('auth.contactAdminModal.requestTypes.loginProblem'),
      passwordReset: t('auth.contactAdminModal.requestTypes.passwordReset'),
      permissionIssue: t('auth.contactAdminModal.requestTypes.permissionIssue'),
      other: t('auth.contactAdminModal.requestTypes.generalSupport')
    };
    return types[type] || type;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-[var(--color-card)] p-4 rounded-2xl border border-[var(--color-border-soft)] shadow-sm">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={20} />
          <input 
            type="text"
            placeholder={t('common.search')}
            className="input-field !ps-12 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="text-[var(--color-text-muted)]" size={20} />
          <select 
            className="input-field py-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">{t('userManagement.supportRequests.all')}</option>
            <option value="pending">{t('userManagement.supportRequests.pending')}</option>
            <option value="resolved">{t('userManagement.supportRequests.resolved')}</option>
            <option value="rejected">{t('userManagement.supportRequests.rejected')}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-16 bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)] border-dashed">
          <MessageSquare size={48} className="mx-auto text-[var(--color-text-muted)] mb-4 opacity-30" />
          <h3 className="text-lg font-black text-[var(--color-text-main)] mb-1">{t('userManagement.supportRequests.noRequests')}</h3>
          <p className="text-[var(--color-text-muted)] font-bold">{t('common.noDataDesc')}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredRequests.map((request) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={request.id} 
              className="glass-card p-6 border-[var(--color-border-soft)] hover:border-[var(--color-primary)]/30 transition-all"
            >
              <div className="flex flex-col lg:flex-row gap-6 justify-between">
                <div className="space-y-4 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[10px] font-mono font-black text-[var(--color-text-muted)] bg-[var(--color-bg-soft)] px-2 py-1 rounded-md border border-[var(--color-border-soft)]">
                      {request.ticketId}
                    </span>
                    {getStatusBadge(request.status)}
                    <span className="text-[10px] text-[var(--color-text-muted)] font-bold flex items-center gap-1 uppercase tracking-widest">
                      <Clock size={14} />
                      {new Date(request.createdAt || '').toLocaleString(i18n.language)}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)] shrink-0">
                        <User size={20} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.name')}</p>
                        <p className="font-black text-[var(--color-text-main)]">{request.fullName}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)] shrink-0">
                        <Mail size={20} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('userManagement.form.contactInfo')}</p>
                        <p className="font-black text-[var(--color-text-main)]">{request.contactInfo}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--color-bg-soft)] p-4 rounded-xl border border-[var(--color-border-soft)]">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText size={16} className="text-[var(--color-text-muted)]" />
                      <span className="font-black text-[var(--color-text-main)] text-sm uppercase tracking-widest">{getRequestTypeLabel(request.requestType)}</span>
                    </div>
                    <p className="text-[var(--color-text-muted)] text-sm font-bold whitespace-pre-wrap">{request.requestDetails || t('userManagement.supportRequests.noDetails')}</p>
                  </div>
                </div>

                {request.status === 'pending' && (
                  <div className="flex lg:flex-col gap-3 shrink-0 lg:w-40">
                    <button 
                      onClick={() => handleUpdateStatus(request.id!, 'resolved')}
                      className="flex-1 lg:flex-none py-2.5 bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={18} />
                      {t('userManagement.supportRequests.resolve')}
                    </button>
                    <button 
                      onClick={() => handleUpdateStatus(request.id!, 'rejected')}
                      className="flex-1 lg:flex-none py-2.5 bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <XCircle size={18} />
                      {t('userManagement.supportRequests.reject')}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupportRequests;
