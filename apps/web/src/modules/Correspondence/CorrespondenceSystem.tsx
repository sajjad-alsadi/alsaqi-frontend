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
import { motion } from 'motion/react';
import { useCorrespondence } from '../../api/hooks/useCorrespondence';
import toast from 'react-hot-toast';
import IncomingRegister from './IncomingRegister';
import CorrespondenceDetails from './CorrespondenceDetails';
import CorrespondenceArchive from './CorrespondenceArchive';
import OutgoingRegister from './OutgoingRegister';
import { Language, CorrespondenceType } from '../../constants';
import { useFormat } from '../../utils/formatService';
import { Button } from '@/components/ui/button';

interface CorrespondenceSystemProps {
  language: Language;
  userRole?: string;
}

interface CorrespondenceStats {
  total_incoming?: number;
  total_outgoing?: number;
  pending_response?: number;
  archived?: number;
}

const CorrespondenceSystem: React.FC<CorrespondenceSystemProps> = ({ language, userRole }) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'incoming' | 'outgoing' | 'archive'>('dashboard');
  const [selectedRecord, setSelectedRecord] = useState<{ type: CorrespondenceType, id: number | string } | null>(null);
  
  const { stats: rawStats, incoming: recentIncoming, loading, error, fetchStats } = useCorrespondence({ limit: 5 });
  const stats = rawStats as CorrespondenceStats | null;

  if (loading && activeSubTab === 'dashboard' && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    );
  }

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { title: t('correspondence.totalIncoming'), value: formatNumber(stats?.total_incoming || 0), icon: <Mail size={22} />, color: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]', onClick: () => setActiveSubTab('incoming') },
          { title: t('correspondence.totalOutgoing'), value: formatNumber(stats?.total_outgoing || 0), icon: <Send size={22} />, color: 'bg-[var(--color-info)]/10 text-[var(--color-info)]', onClick: () => setActiveSubTab('outgoing') },
          { title: t('correspondence.pendingResponses'), value: formatNumber(stats?.pending_response || 0), icon: <Clock size={22} />, color: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]', onClick: undefined },
          { title: t('correspondence.archive'), value: formatNumber(stats?.archived || 0), icon: <Archive size={22} />, color: 'bg-[var(--color-bg-soft)] text-[var(--color-text-muted)]', onClick: () => setActiveSubTab('archive') },
        ].map((card, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.3, ease: 'easeOut' }}
            onClick={card.onClick}
            className="interactive-card p-5 group hover:border-[var(--color-primary)]/20"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl ${card.color} flex items-center justify-center group-hover:scale-105 transition-transform duration-200`}>
                {card.icon}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">{card.title}</p>
              <p className="text-2xl font-bold text-[var(--color-text-main)]">{card.value}</p>
            </div>
          </motion.div>
        ))}
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
                    <span className="text-sm font-bold text-[var(--color-text-main)]">{formatNumber((item as { sequence_number?: number | string }).sequence_number || item.id)}</span>
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
        id={Number(selectedRecord.id)} 
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
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <Mail size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-main)] tracking-tight">
              {t('correspondence.systemTitle')}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              {t('correspondence.systemDesc')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button 
            onClick={() => setActiveSubTab('incoming')}
            className="flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus size={18} />
            {t('correspondence.registerIncoming')}
          </Button>
          <Button 
            variant="outline"
            onClick={() => setActiveSubTab('outgoing')}
            className="flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus size={18} />
            {t('correspondence.registerOutgoing')}
          </Button>
        </div>
      </div>

      <div className="flex gap-2 p-1.5 bg-[var(--color-card)] rounded-2xl w-fit overflow-x-auto border border-[var(--color-border-soft)]">
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

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, label, icon }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
      active 
        ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/20' 
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)]'
    }`}
  >
    {icon}
    {label}
  </button>
);

export default CorrespondenceSystem;
