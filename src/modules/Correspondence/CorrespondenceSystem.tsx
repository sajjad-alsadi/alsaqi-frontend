import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Send, 
  Clock, 
  CheckCircle, 
  Archive, 
  AlertCircle,
  FileText,
  Link as LinkIcon,
  Search,
  Plus,
  Filter,
  Download,
  Eye,
  ArrowRight,
  User,
  Building
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCorrespondence } from '../../hooks/useCorrespondence';
import { correspondenceService } from '../../services/correspondenceService';
import toast from 'react-hot-toast';
import IncomingRegister from './IncomingRegister';
import CorrespondenceDetails from './CorrespondenceDetails';
import CorrespondenceArchive from './CorrespondenceArchive';
import OutgoingRegister from './OutgoingRegister';
import { Language, CorrespondenceType } from '../../constants';
import { useFormat } from '../../services/formatService';

interface CorrespondenceSystemProps {
  language: Language;
  userRole?: string;
}

const CorrespondenceSystem: React.FC<CorrespondenceSystemProps> = ({ language, userRole }) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'incoming' | 'outgoing' | 'archive'>('dashboard');
  const [selectedRecord, setSelectedRecord] = useState<{ type: CorrespondenceType, id: number } | null>(null);
  
  const { stats, incoming: recentIncoming, loading, error, fetchStats } = useCorrespondence({ limit: 5 });

  if (loading && activeSubTab === 'dashboard' && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    );
  }

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard 
          title={t('correspondence.totalIncoming')} 
          value={formatNumber(stats?.total_incoming || 0)} 
          icon={<Mail className="text-[var(--color-primary)]" />} 
          color="bg-[var(--color-primary)]/10"
          onClick={() => setActiveSubTab('incoming')}
        />
        <StatCard 
          title={t('correspondence.totalOutgoing')} 
          value={formatNumber(stats?.total_outgoing || 0)} 
          icon={<Send className="text-[var(--color-secondary)]" />} 
          color="bg-[var(--color-secondary)]/10"
          onClick={() => setActiveSubTab('outgoing')}
        />
        <StatCard 
          title={t('correspondence.pendingResponses')} 
          value={formatNumber(stats?.pending_response || 0)} 
          icon={<Clock className="text-[var(--color-warning)]" />} 
          color="bg-[var(--color-warning)]/10"
        />
        <StatCard 
          title={t('correspondence.archive')} 
          value={formatNumber(stats?.archived || 0)} 
          icon={<Archive className="text-[var(--color-text-muted)]" />} 
          color="bg-[var(--color-bg-main)]"
          onClick={() => setActiveSubTab('archive')}
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[var(--color-text-main)]">
            <Mail size={20} className="text-[var(--color-primary)]" />
            {t('correspondence.recentIncomingLetters')}
          </h3>
          <div className="space-y-3">
            {(!Array.isArray(recentIncoming) || recentIncoming.length === 0) ? (
              <p className="text-sm text-[var(--color-text-muted)] italic">
                {t('correspondence.noIncomingCorrespondence')}
              </p>
            ) : (
              recentIncoming.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => setSelectedRecord({ type: CorrespondenceType.INCOMING, id: item.id })}
                  className="p-3 border border-[var(--color-border-soft)] rounded-xl hover:bg-[var(--color-bg-main)] cursor-pointer transition-colors flex justify-between items-center"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-[var(--color-text-main)]">{formatNumber(item.sequence_number)}</span>
                    <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[200px]">{item.subject}</span>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)]/70">{item.receipt_date}</span>
                </div>
              ))
            )}
          </div>
          <button 
            onClick={() => setActiveSubTab('incoming')}
            className="mt-4 text-[var(--color-primary)] text-sm font-medium hover:underline flex items-center gap-1"
          >
            {t('correspondence.viewAll')}
            <ArrowRight size={14} className={language === Language.AR ? 'rotate-180' : ''} />
          </button>
        </div>
      </div>
    </div>
  );

  if (selectedRecord) {
    return (
      <CorrespondenceDetails 
        type={selectedRecord.type} 
        id={selectedRecord.id} 
        language={language} 
        onBack={() => {
          setSelectedRecord(null);
          fetchStats();
        }} 
      />
    );
  }

  return (
    <div className="space-y-6" dir={language === Language.AR ? 'rtl' : 'ltr'}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm border border-slate-100">
            <Mail size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">
              {t('correspondence.systemTitle')}
            </h3>
            <p className="text-xs text-slate-400 font-bold">
              {t('correspondence.systemDesc')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setActiveSubTab('incoming')}
            className="btn-primary !py-2.5 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
          >
            <Plus size={18} />
            {t('correspondence.registerIncoming')}
          </button>
          <button 
            onClick={() => setActiveSubTab('outgoing')}
            className="btn-secondary !py-2.5 flex items-center justify-center gap-2 whitespace-nowrap text-sm bg-white"
          >
            <Plus size={18} />
            {t('correspondence.registerOutgoing')}
          </button>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit overflow-x-auto">
        <TabButton 
          active={activeSubTab === 'dashboard'} 
          onClick={() => setActiveSubTab('dashboard')}
          label={t('common.dashboard')}
          icon={<FileText size={18} />}
        />
        <TabButton 
          active={activeSubTab === 'incoming'} 
          onClick={() => setActiveSubTab('incoming')}
          label={t('correspondence.incomingRegister')}
          icon={<Mail size={18} />}
        />
        <TabButton 
          active={activeSubTab === 'outgoing'} 
          onClick={() => setActiveSubTab('outgoing')}
          label={t('correspondence.outgoingRegister')}
          icon={<Send size={18} />}
        />
        <TabButton 
          active={activeSubTab === 'archive'} 
          onClick={() => setActiveSubTab('archive')}
          label={t('correspondence.archive')}
          icon={<Archive size={18} />}
        />
      </div>

      {activeSubTab === 'dashboard' && renderDashboard()}
      {activeSubTab === 'incoming' && (
        <IncomingRegister 
          language={language} 
          onViewDetails={(id) => setSelectedRecord({ type: CorrespondenceType.INCOMING, id })} 
        />
      )}
      {activeSubTab === 'outgoing' && (
        <OutgoingRegister 
          language={language} 
          userRole={userRole} 
          onViewDetails={(type, id) => setSelectedRecord({ type: type as CorrespondenceType, id })}
        />
      )}
      {activeSubTab === 'archive' && (
        <CorrespondenceArchive 
          language={language} 
          onViewDetails={(type, id) => setSelectedRecord({ type: type as CorrespondenceType, id })} 
        />
      )}
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, onClick }) => (
  <div 
    onClick={onClick}
    className={`${color} p-6 rounded-[2rem] border border-[var(--color-border-soft)] shadow-sm cursor-pointer hover:shadow-md transition-shadow`}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-[var(--color-text-muted)] font-medium">{title}</span>
      {icon}
    </div>
    <div className="text-3xl font-bold text-[var(--color-text-main)]">{value}</div>
  </div>
);

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, label, icon }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all whitespace-nowrap ${
      active 
        ? 'bg-white text-[var(--color-primary)] shadow-sm' 
        : 'text-slate-500 hover:text-slate-700'
    }`}
  >
    {icon}
    {label}
  </button>
);

export default CorrespondenceSystem;
