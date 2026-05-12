import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useFormat } from '../../services/formatService';
import { useCountUp } from '../../hooks/useCountUp';
import { useScrollReveal } from '../../hooks/useScrollReveal';

interface KpiCard {
  id: string;
  title: string;
  value: number;
  icon: any;
  color: string;
  bg: string;
  trend?: string;
  trendUp?: boolean;
  link?: string;
}

interface DashboardKpiGridProps {
  cards: KpiCard[];
}

/** Individual KPI card with count-up animation */
const KpiCardItem: React.FC<{
  card: KpiCard;
  idx: number;
  isVisible: boolean;
  navigate: ReturnType<typeof useNavigate>;
  formatNumber: (val: any) => string;
}> = ({ card, idx, isVisible, navigate, formatNumber }) => {
  const animatedValue = useCountUp(card.value, { enabled: isVisible, duration: 700 + idx * 100 });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ delay: idx * 0.04, duration: 0.3, ease: 'easeOut' }}
      onClick={() => card.link && navigate(card.link)}
      className="interactive-card p-5 group hover:border-[var(--color-primary)]/20"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl ${card.bg} ${card.color} flex items-center justify-center group-hover:scale-105 transition-transform duration-200`}>
          <card.icon size={22} />
        </div>
        {card.trend && (
          <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${card.trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {card.trendUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {formatNumber(card.trend)}
          </div>
        )}
      </div>
      <div>
        <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">{card.title}</p>
        <p className="text-2xl font-bold text-[var(--color-text-main)]">{formatNumber(animatedValue)}</p>
      </div>
    </motion.div>
  );
};

const DashboardKpiGrid: React.FC<DashboardKpiGridProps> = React.memo(({ cards }) => {
  const navigate = useNavigate();
  const { formatNumber } = useFormat();
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {cards.map((card, idx) => (
        <KpiCardItem
          key={card.id}
          card={card}
          idx={idx}
          isVisible={isVisible}
          navigate={navigate}
          formatNumber={formatNumber}
        />
      ))}
    </div>
  );
});

export default DashboardKpiGrid;
