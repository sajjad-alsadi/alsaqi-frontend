import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useFormat } from '../../services/formatService';

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

const DashboardKpiGrid: React.FC<DashboardKpiGridProps> = React.memo(({ cards }) => {
  const navigate = useNavigate();
  const { formatNumber } = useFormat();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {cards.map((card, idx) => (
        <motion.div 
          key={card.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05 }}
          onClick={() => card.link && navigate(card.link)}
          className="glass-card p-6 group cursor-pointer hover:border-[var(--color-primary)]/30 transition-all hover:shadow-md"
        >
          <div className="flex items-start justify-between mb-4">
            <div className={`w-12 h-12 rounded-[1.2rem] ${card.bg} ${card.color} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
              <card.icon size={24} />
            </div>
            {card.trend && (
              <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg ${card.trendUp ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'}`}>
                {card.trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {formatNumber(card.trend)}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{card.title}</p>
            <p className="text-3xl font-black text-[var(--color-text-main)]">{formatNumber(card.value)}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
});

export default DashboardKpiGrid;
