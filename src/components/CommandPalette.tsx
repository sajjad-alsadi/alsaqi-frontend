import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  LayoutDashboard, 
  CalendarRange, 
  ClipboardCheck, 
  Library, 
  FileSearch, 
  TrendingUp, 
  ShieldAlert, 
  Building, 
  Scale, 
  Settings, 
  Users, 
  Bell, 
  Network, 
  BarChart3, 
  BookOpen, 
  FileText,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  path: string;
  icon: any;
  keywords: string[];
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = useMemo(() => [
    { id: 'dashboard', label: t('common.dashboard'), path: '/dashboard', icon: LayoutDashboard, keywords: ['home', 'main', 'الرئيسية', 'لوحة'] },
    { id: 'charter', label: t('common.auditCharter'), path: '/charter', icon: BookOpen, keywords: ['charter', 'ميثاق'] },
    { id: 'plan', label: t('common.auditPlan'), path: '/plan', icon: CalendarRange, keywords: ['plan', 'خطة', 'تخطيط'] },
    { id: 'tasks', label: t('common.tasks'), path: '/tasks', icon: ClipboardCheck, keywords: ['task', 'مهام', 'إجراءات'] },
    { id: 'library', label: t('common.library'), path: '/library', icon: Library, keywords: ['library', 'program', 'مكتبة', 'برنامج'] },
    { id: 'findings', label: t('common.findings'), path: '/findings', icon: FileSearch, keywords: ['finding', 'ملاحظات', 'نتائج'] },
    { id: 'evidence', label: t('common.evidence'), path: '/evidence', icon: FileText, keywords: ['evidence', 'أدلة', 'مستندات'] },
    { id: 'recommendations', label: t('common.recommendations'), path: '/recommendations', icon: TrendingUp, keywords: ['recommendation', 'توصيات'] },
    { id: 'risks', label: t('common.risks'), path: '/risks', icon: ShieldAlert, keywords: ['risk', 'مخاطر'] },
    { id: 'compliance', label: t('common.complianceMatrix'), path: '/compliance-matrix', icon: ShieldCheck, keywords: ['compliance', 'matrix', 'امتثال', 'مصفوفة'] },
    { id: 'integrity', label: t('common.integrityManagement'), path: '/integrity', icon: Scale, keywords: ['integrity', 'fraud', 'نزاهة', 'احتيال'] },
    { id: 'departments', label: t('common.departments'), path: '/departments', icon: Building, keywords: ['department', 'org', 'أقسام', 'هيكل'] },
    { id: 'reports', label: t('common.reportsAndAnalytics'), path: '/reports', icon: BarChart3, keywords: ['report', 'analytics', 'تقارير', 'تحليلات'] },
    { id: 'cms', label: t('common.cms'), path: '/cms', icon: Network, keywords: ['correspondence', 'mail', 'مراسلات', 'بريد'] },
    { id: 'notifications', label: t('common.notifications'), path: '/notifications', icon: Bell, keywords: ['notification', 'alert', 'تنبيهات', 'إشعارات'] },
    { id: 'users', label: t('common.users'), path: '/users', icon: Users, keywords: ['user', 'مستخدمين', 'صلاحيات'] },
    { id: 'settings', label: t('common.settings'), path: '/settings', icon: Settings, keywords: ['settings', 'preference', 'إعدادات', 'تفضيلات'] },
  ], [t]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd => 
      cmd.label.toLowerCase().includes(q) ||
      cmd.id.includes(q) ||
      cmd.keywords.some(k => k.includes(q))
    );
  }, [query, commands]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSelect = (item: CommandItem) => {
    navigate(item.path);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        handleSelect(filteredCommands[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-lg bg-[var(--color-card)] rounded-2xl shadow-2xl border border-[var(--color-border-soft)] overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border-soft)]">
              <Search size={20} className="text-[var(--color-text-muted)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('common.searchPages') || 'Search pages...'}
                className="flex-1 bg-transparent outline-none text-[var(--color-text-main)] placeholder:text-[var(--color-text-muted)]/60 text-sm"
                autoComplete="off"
              />
              <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 bg-[var(--color-bg-soft)] border border-[var(--color-border-soft)] rounded-lg text-[10px] font-semibold text-[var(--color-text-muted)]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[320px] overflow-y-auto p-2">
              {filteredCommands.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                  {t('common.noResults') || 'No results found'}
                </div>
              ) : (
                filteredCommands.map((item, idx) => {
                  const Icon = item.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-start transition-colors cursor-pointer ${
                        isSelected 
                          ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' 
                          : 'text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)]'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-[var(--color-primary)]/20' : 'bg-[var(--color-bg-soft)]'
                      }`}>
                        <Icon size={18} />
                      </div>
                      <span className="flex-1 text-sm font-semibold">{item.label}</span>
                      {isSelected && (
                        <ArrowRight size={14} className="text-[var(--color-primary)] rtl:rotate-180" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer hint */}
            <div className="px-5 py-3 border-t border-[var(--color-border-soft)] bg-[var(--color-bg-soft)]/50 flex items-center gap-4 text-[10px] text-[var(--color-text-muted)] font-semibold">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded text-[9px]">↑↓</kbd>
                {t('common.navigate') || 'Navigate'}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded text-[9px]">↵</kbd>
                {t('common.select') || 'Select'}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded text-[9px]">Esc</kbd>
                {t('common.close') || 'Close'}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
