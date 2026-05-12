import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, Tooltip } from 'recharts';
import ChartContainer from '../../components/ChartContainer';
import { useFormat } from '../../services/formatService';
import { useScrollReveal } from '../../hooks/useScrollReveal';

interface DashboardRiskOverviewProps {
  t: any;
  stats: any;
  colors: string[];
}

const DashboardRiskOverview: React.FC<DashboardRiskOverviewProps> = React.memo(({ t, stats, colors }) => {
  const { formatNumber } = useFormat();
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={ref} className={`glass-card p-8 flex flex-col min-w-0 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <h3 className="text-xl font-bold text-[var(--color-text-main)] mb-8 flex items-center gap-3">
        <ShieldAlert className="text-[var(--color-danger)]" />
        {t('dashboard.riskOverview')}
      </h3>
      <div className="flex-1 min-h-[250px] w-full min-w-0 relative">
        <ChartContainer debugName="RiskOverviewPieChart" minHeight={250}>
          {(width, height) => (
            <RePieChart width={width} height={height}>
              <Pie
                data={(Array.isArray(stats.risks.byLevel) ? stats.risks.byLevel : []).map((r: any) => ({ name: r.level, value: r.count }))}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
                animationBegin={200}
                animationDuration={800}
                animationEasing="ease-out"
              >
                {(Array.isArray(stats.risks.byLevel) ? stats.risks.byLevel : []).map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any, name: string) => [formatNumber(value), t((name || '').toLowerCase())]}
                contentStyle={{ 
                  borderRadius: '1rem', 
                  border: '1px solid var(--color-border-soft)', 
                  backgroundColor: 'var(--color-card)',
                  color: 'var(--color-text-main)'
                }}
              />
            </RePieChart>
          )}
        </ChartContainer>
        <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
          <span className="text-3xl font-bold text-[var(--color-text-main)]">{formatNumber(stats.risks.summary.total)}</span>
          <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">{t('dashboard.totalRisks')}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-6">
        {(Array.isArray(stats.risks.byLevel) ? stats.risks.byLevel : []).map((risk: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 bg-[var(--color-bg-main)] p-2 rounded-xl">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }}></div>
            <span className="text-xs font-semibold text-[var(--color-text-main)] uppercase tracking-widest">{t((risk.level || '').toLowerCase())}: {formatNumber(risk.count)}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default DashboardRiskOverview;
