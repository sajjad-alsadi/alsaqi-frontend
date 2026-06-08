import React from 'react';
import { Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip 
} from 'recharts';
import ChartContainer from '../../components/ChartContainer';
import { useFormat } from '../../utils/formatService';
import { useScrollReveal } from '../../hooks/useScrollReveal';

interface DashboardAuditProgressProps {
  t: any;
  isRtl: boolean;
  data: any[];
  totalPlanned?: number;
  totalCompleted?: number;
}

const DashboardAuditProgress: React.FC<DashboardAuditProgressProps> = React.memo(({ t, isRtl, data, totalPlanned = 0, totalCompleted = 0 }) => {
  const { formatNumber } = useFormat();
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();
  
  // Calculate completion rate based on real data
  const completionRate = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;


  return (
    <div ref={ref} className={`lg:col-span-2 glass-card p-8 min-w-0 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold text-[var(--color-text-main)] flex items-center gap-3">
          <Activity className="text-[var(--color-primary)]" />
          {t('dashboard.auditPlanOverview')}
        </h3>
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-[var(--color-success)] uppercase tracking-widest">{t('dashboard.completionRate')}: {formatNumber(completionRate)}%</span>
          <div className="w-40 h-3 bg-[var(--color-bg-main)] dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-[var(--color-border-soft)] dark:border-slate-700 shadow-inner">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${completionRate}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-[var(--color-success)] to-emerald-400 rounded-full shadow-sm"
            />
          </div>
        </div>
      </div>
      
      <div className="h-[300px] w-full min-w-0">
        <ChartContainer debugName="AuditProgressChart" minHeight={300}>
          {(width, height) => (
            <BarChart width={width} height={height} data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-soft)" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-muted)' }} 
                reversed={isRtl}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-muted)' }} 
                orientation={isRtl ? 'right' : 'left'}
                dx={isRtl ? 10 : -10}
                tickFormatter={(value) => formatNumber(value)}
              />
              <Tooltip 
                formatter={(value: any, name: any) => [formatNumber(value), t((name || '').toString())]}
                contentStyle={{ 
                  borderRadius: '1rem', 
                  border: '1px solid var(--color-border-soft)', 
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  textAlign: isRtl ? 'right' : 'left',
                  direction: isRtl ? 'rtl' : 'ltr',
                  backgroundColor: 'var(--color-card)',
                  color: 'var(--color-text-main)'
                }}
                cursor={{ fill: 'var(--color-bg-main)' }}
              />
              <Bar dataKey="planned" fill="var(--color-info)" radius={[6, 6, 0, 0]} barSize={24} />
              <Bar dataKey="completed" fill="var(--color-success)" radius={[6, 6, 0, 0]} barSize={24} />
            </BarChart>
          )}
        </ChartContainer>
      </div>
    </div>
  );
});

export default DashboardAuditProgress;
