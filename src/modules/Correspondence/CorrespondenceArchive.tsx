import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Archive, 
  Eye, 
  Download, 
  Mail, 
  Send,
  Calendar,
  Building,
  Filter
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import toast from 'react-hot-toast';
import Pagination from '../../components/Pagination';
import { useFormat } from '../../services/formatService';
import { useDebounce } from '../../hooks/useDebounce';

interface CorrespondenceArchiveProps {
  language: 'ar' | 'en';
  onViewDetails: (type: 'Incoming' | 'Outgoing', id: number) => void;
}

const CorrespondenceArchive: React.FC<CorrespondenceArchiveProps> = ({ language, onViewDetails }) => {
  const { t } = useTranslation();
  const { formatNumber, formatDate } = useFormat();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [typeFilter, setTypeFilter] = useState<'All' | 'Incoming' | 'Outgoing'>('All');
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 0 });

  useEffect(() => {
    fetchArchived();
  }, [debouncedSearch, typeFilter, pagination.page, pagination.pageSize]);

  const fetchArchived = async () => {
    try {
      setLoading(true);
      const response = await api.get('/correspondence/archive', {
        params: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          type: typeFilter !== 'All' ? typeFilter : undefined,
          search: debouncedSearch || undefined
        }
      });
      
      if (response.data.data) {
        setItems(response.data.data);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total,
          totalPages: response.data.pagination.totalPages
        }));
      }
    } catch (error) {
      console.error("Failed to fetch archived correspondence", error);
      toast.error(t('errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder={t('correspondence.searchArchivePlaceholder')}
            className="w-full p-2.5 ps-11 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary transition-colors shadow-sm"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
          />
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button 
            onClick={() => {
              setTypeFilter('All');
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${typeFilter === 'All' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t('correspondence.all')}
          </button>
          <button 
            onClick={() => {
              setTypeFilter('Incoming');
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${typeFilter === 'Incoming' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t('correspondence.incoming')}
          </button>
          <button 
            onClick={() => {
              setTypeFilter('Outgoing');
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${typeFilter === 'Outgoing' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t('correspondence.outgoing')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('correspondence.type')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('correspondence.seqNumber')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('correspondence.subject')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('correspondence.entity')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('correspondence.archiveDate')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400 font-bold text-sm">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400 font-bold text-sm">
                    {t('correspondence.archiveIsEmpty')}
                  </td>
                </tr>
              ) : (Array.isArray(items) ? items : []).map((item, idx) => (
                <tr key={idx} className="hover:bg-primary/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {item.type === 'Incoming' ? (
                        <Mail size={16} className="text-primary" />
                      ) : (
                        <Send size={16} className="text-teal-500" />
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t(`correspondence.${item.type.toLowerCase()}`)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-300 tracking-widest">{formatNumber(item.sequence_number)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-700 max-w-xs truncate">{item.subject}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-700">{item.entity}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-700">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      {formatDate(item.updated_at) || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => onViewDetails(item.type, item.id)}
                        className="p-2 bg-white text-primary border border-slate-100 hover:border-primary/30 rounded-xl shadow-sm transition-all"
                        title={t('correspondence.viewDetails')}
                      >
                        <Eye size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination 
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
        pageSize={pagination.pageSize}
        onPageSizeChange={(pageSize) => setPagination(prev => ({ ...prev, pageSize, page: 1 }))}
        totalItems={pagination.total}
      />
    </div>
  );
};

export default CorrespondenceArchive;
