import React from 'react';
import { Search, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ReportFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  deptFilter: string;
  setDeptFilter: (dept: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  riskFilter: string;
  setRiskFilter: (risk: string) => void;
  departments: string[];
}

const ReportFilters: React.FC<ReportFiltersProps> = ({
  searchQuery,
  setSearchQuery,
  deptFilter,
  setDeptFilter,
  statusFilter,
  setStatusFilter,
  riskFilter,
  setRiskFilter,
  departments
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
      <div className="flex flex-col md:flex-row md:items-center gap-4 flex-1">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={18} />
          <input 
            type="text"
            placeholder={t('reports.searchReports')}
            className="input-field w-full !ps-12"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 bg-[var(--color-card)] p-1 rounded-xl border border-[var(--color-border-soft)]">
          <div className="px-3 text-[var(--color-text-muted)]">
            <Filter size={16} />
          </div>
          <select 
            className="bg-transparent border-none text-xs font-bold text-[var(--color-text-main)] focus:ring-0 pe-8"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">{t('reports.allDepartments')}</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{t(`plan.${dept.toLowerCase()}`)}</option>
            ))}
          </select>
          <select 
            className="bg-transparent border-none text-xs font-bold text-[var(--color-text-main)] focus:ring-0 pe-8"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{t('reports.allStatuses')}</option>
            <option value="Final">{t('reports.final')}</option>
            <option value="Draft">{t('reports.draft')}</option>
            <option value="Closed">{t('common.closed')}</option>
          </select>
          <select 
            className="bg-transparent border-none text-xs font-bold text-[var(--color-text-main)] focus:ring-0 pe-8"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="">{t('reports.allRiskLevels')}</option>
            <option value="High">{t('reports.high')}</option>
            <option value="Medium">{t('reports.medium')}</option>
            <option value="Low">{t('reports.low')}</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default ReportFilters;
