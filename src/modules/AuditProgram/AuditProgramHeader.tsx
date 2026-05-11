import React from 'react';
import { Library, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AuditProgramHeaderProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterType: string;
  setFilterType: (type: string) => void;
  auditTypes: string[];
  onAdd: () => void;
}

const AuditProgramHeader: React.FC<AuditProgramHeaderProps> = ({
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
  auditTypes,
  onAdd
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
      <div className="flex items-center gap-6">
        <div className="w-16 h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
          <Library size={32} />
        </div>
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">{t('program.library')}</h2>
          <p className="text-sm text-slate-400 font-bold mt-2">
            {t('program.manageAndStandardizeAuditPrograms')}
          </p>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute start-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text"
            placeholder={t('program.search')}
            className="input-field !ps-14"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <select className="input-field py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="All">{t('program.allTypes')}</option>
            {auditTypes.map(type => <option key={type} value={type}>{t(`plan.${type.toLowerCase()}`)}</option>)}
          </select>
          <button 
            onClick={onAdd} 
            className="btn-primary flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} />
            {t('program.add')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuditProgramHeader;
