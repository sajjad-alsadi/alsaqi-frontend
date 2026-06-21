import React from 'react';
import { Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { TFunction } from 'i18next';
import ChartContainer from '../../components/ChartContainer';
import { useFormat } from '../../utils/formatService';
import { useScrollReveal } from '../../hooks/useScrollReveal';

interface DashboardAuditProgressProps {
  t: TFunction;
  isRtl: boolean;
  data: any[];
  totalPlanned?: number;
  totalCompleted?: number;
}

const DashboardAuditProgress: React.FC<DashboardAuditProgressProps> = React.memo(
  ({ t, isRtl, data, totalPlanned = 0, totalCompleted = 0 }) => {
    const { formatNumber } = useFormat();
    const { ref, isVisible } = useScrollReveal<HTMLDivElement>();

    const completionRate =
      totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;

    return (
      <div
        ref={ref}
        className={`lg:col-span-2 glass-card p-8 min-w-0 transition-all duration-500 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-[var(--color-text-main)] flex items-center gap-2.5">
            <Activity size={18} className="text-[var(--color-primary)]" aria-hidden="true" />
            {t('dashboard.auditPlanOverview')}
          </h3>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[var(--color-success)]">
              {t('dashboard.completionRate')}: {formatNumber(completionRate)}%
            </span>
            <div
              role="progressbar"
              aria-valuenow={completionRate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${t('dashboard.completionRate')}: ${completionRate}%`}
              className="w-32 h-2.5 bg-[var(--color-bg-main)] rounded-full overflow-hidden border border-[var(--color-border-soft)] shadow-inner"
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${completionRate}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-[var(--color-success)] rounded-full"
              />
            </div>
          </div>
        </div>

        {/* ── Chart ── */}
        <div className="h-[280px] w-full min-w-0">
          <ChartContainer debugName="AuditProgressChart" minHeight={280}>
            {(width, height) => (
              <BarChart
                width={width}
                height={height}
                data={data}
                margin={{ top: 4, right: 4, left: 0, bottom: 24 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--color-border-soft)"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 11,
                    fontWeight: 600,
                    fill: 'var(--color-text-muted)',
                  }}
                  reversed={isRtl}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 11,
                    fontWeight: 600,
                    fill: 'var(--color-text-muted)',
                  }}
                  orientation={isRtl ? 'right' : 'left'}
                  dx={isRtl ? 10 : -10}
                  tickFormatter={(value) => formatNumber(value)}
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    formatNumber(value),
                    t((name || '').toString()),
                  ]}
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: '1px solid var(--color-border-soft)',
                    boxShadow: 'var(--shadow-md)',
                    textAlign: isRtl ? 'right' : 'left',
                    direction: isRtl ? 'rtl' : 'ltr',
                    backgroundColor: 'var(--color-card)',
                    color: 'var(--color-text-main)',
                  }}
                  cursor={{ fill: 'var(--color-bg-main)' }}
                />
                {/* Visible legend — removes hover-only discoverability */}
                <Legend
                  verticalAlign="bottom"
                  height={32}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    paddingTop: '8px',
                    direction: isRtl ? 'rtl' : 'ltr',
                  }}
                  formatter={(value) => t(value)}
                />
                <Bar
                  dataKey="planned"
                  name="planned"
                  fill="var(--color-info)"
                  radius={[5, 5, 0, 0]}
                  barSize={20}
                />
                <Bar
                  dataKey="completed"
                  name="completed"
                  fill="var(--color-success)"
                  radius={[5, 5, 0, 0]}
                  barSize={20}
                />
              </BarChart>
            )}
          </ChartContainer>
        </div>
      </div>
    );
  }
);

export default DashboardAuditProgress;
