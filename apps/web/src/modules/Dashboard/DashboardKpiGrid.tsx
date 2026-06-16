import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUpRight, ArrowDownRight, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useFormat } from '../../utils/formatService';
import { useCountUp } from '../../hooks/useCountUp';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import Tooltip from '../../components/ui/Tooltip';

export interface KpiCard {
  id: string;
  title: string;
  /** Short description shown in a tooltip on the card title */
  description?: string;
  value: number;
  icon: any;
  color: string;
  bg: string;
  trend?: string;
  trendUp?: boolean;
  link?: string;
  /** When true, the card is visually promoted in the highlight row */
  highlight?: boolean;
}

interface KpiCardItemProps {
  card: KpiCard;
  idx: number;
  isVisible: boolean;
  navigate: ReturnType<typeof useNavigate>;
  formatNumber: (val: any) => string;
  /** Promoted cards get larger number, slightly more padding */
  size?: 'default' | 'highlight';
}

/** Individual KPI card with count-up animation */
const KpiCardItem: React.FC<KpiCardItemProps> = ({
  card,
  idx,
  isVisible,
  navigate,
  formatNumber,
  size = 'default',
}) => {
  const animatedValue = useCountUp(card.value, {
    enabled: isVisible,
    duration: 700 + idx * 100,
  });

  const isHighlight = size === 'highlight';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ delay: idx * 0.04, duration: 0.3, ease: 'easeOut' }}
      onClick={() => card.link && navigate(card.link)}
      role={card.link ? 'link' : undefined}
      tabIndex={card.link ? 0 : undefined}
      onKeyDown={(e) => {
        if (card.link && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          navigate(card.link);
        }
      }}
      aria-label={`${card.title}: ${formatNumber(card.value)}`}
      className={`interactive-card group hover:border-[var(--color-primary)]/20 ${
        isHighlight ? 'p-6' : 'p-5'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={`rounded-xl ${card.bg} ${card.color} flex items-center justify-center group-hover:scale-105 transition-transform duration-200 ${
            isHighlight ? 'w-12 h-12' : 'w-11 h-11'
          }`}
        >
          <card.icon size={isHighlight ? 24 : 22} />
        </div>
        {card.trend && (
          <div
            aria-label={card.trendUp ? `Trending up: ${card.trend}` : `Trending down: ${card.trend}`}
            className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${
              card.trendUp
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
            }`}
          >
            {card.trendUp ? (
              <ArrowUpRight size={11} aria-hidden="true" />
            ) : (
              <ArrowDownRight size={11} aria-hidden="true" />
            )}
            {formatNumber(card.trend)}
          </div>
        )}
      </div>
      <div>
        <Tooltip content={card.description ?? ''} side="top">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-1 leading-snug">
            {card.title}
          </p>
        </Tooltip>
        <p
          className={`font-bold text-[var(--color-text-main)] leading-none ${
            isHighlight ? 'text-3xl' : 'text-2xl'
          }`}
        >
          {formatNumber(animatedValue)}
        </p>
      </div>
    </motion.div>
  );
};

/** Collapsible group of secondary KPI cards */
const KpiGroup: React.FC<{
  label: string;
  cards: KpiCard[];
  groupIdx: number;
  isVisible: boolean;
  navigate: ReturnType<typeof useNavigate>;
  formatNumber: (val: any) => string;
}> = ({ label, cards, groupIdx, isVisible, navigate, formatNumber }) => {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-3">
      <Tooltip
        content={open ? 'Click to collapse these monitoring metrics' : 'Click to expand these monitoring metrics'}
        side="top"
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors"
          aria-expanded={open}
        >
          <span>{label}</span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
          />
        </button>
      </Tooltip>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="group-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {cards.map((card, idx) => (
                <KpiCardItem
                  key={card.id}
                  card={card}
                  idx={groupIdx * 10 + idx}
                  isVisible={isVisible}
                  navigate={navigate}
                  formatNumber={formatNumber}
                  size="default"
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export interface KpiGroup {
  label: string;
  cards: KpiCard[];
}

export interface DashboardKpiGridProps {
  /** The 3–4 most critical metrics. Rendered in a larger highlight row. */
  highlightCards: KpiCard[];
  /** Secondary metric groups, each collapsible. */
  groups: KpiGroup[];
  /** Label shown above the highlight row to communicate it shows priority metrics */
  priorityLabel?: string;
}

const DashboardKpiGrid: React.FC<DashboardKpiGridProps> = React.memo(
  ({ highlightCards, groups, priorityLabel }) => {
    const navigate = useNavigate();
    const { formatNumber } = useFormat();
    const { ref, isVisible } = useScrollReveal<HTMLDivElement>();

    return (
      <div ref={ref} className="space-y-6">
        {/* ── Priority highlight row ── */}
        <div className="space-y-3">
          {priorityLabel && (
            <p className="text-xs font-semibold text-[var(--color-text-muted)]">
              {priorityLabel}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {highlightCards.map((card, idx) => (
              <KpiCardItem
                key={card.id}
                card={card}
                idx={idx}
                isVisible={isVisible}
                navigate={navigate}
                formatNumber={formatNumber}
                size="highlight"
              />
            ))}
          </div>
        </div>

        {/* ── Secondary grouped rows ── */}
        {groups.map((group, groupIdx) => (
          <KpiGroup
            key={group.label}
            label={group.label}
            cards={group.cards}
            groupIdx={groupIdx}
            isVisible={isVisible}
            navigate={navigate}
            formatNumber={formatNumber}
          />
        ))}
      </div>
    );
  }
);

export default DashboardKpiGrid;
