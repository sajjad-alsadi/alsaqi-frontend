import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  LineChart, 
  Line, 
  Cell
} from 'recharts';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ChartContainer from '../../../components/ChartContainer';
import { useFormat } from '../../../utils/formatService';
import { useScrollReveal } from '../../../hooks/useScrollReveal';
import { ExecData } from '../types';

interface ExecutiveChartsProps {
  execData: ExecData;
  language: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const ExecutiveCharts: React.FC<ExecutiveChartsProps> = ({ execData, language }) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={ref} className={`grid grid-cols-1 lg:grid-cols-2 gap-8 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      {/* Findings Trend Chart */}
      <div className="glass-card p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
            <h3 className="text-xl font-bold text-[var(--color-text-main)]">{t('reports.findingsTrend')}</h3>
          </div>
        </div>
        <div className="h-64 w-full min-w-0">
          <ChartContainer debugName="FindingsTrendChart" minHeight={256}>
            {(width, height) => (
              <LineChart width={width} height={height} data={execData.findingsTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-soft)" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 'bold', fill: 'var(--color-text-muted)' }}
                  reversed={language === 'ar'}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 'bold', fill: 'var(--color-text-muted)' }}
                  orientation={language === 'ar' ? 'right' : 'left'}
                  tickFormatter={formatNumber}
                />
                <Tooltip 
                  formatter={(value: any) => [formatNumber(value), t('reports.count')]}
                  contentStyle={{ 
                    borderRadius: '1rem', 
                    border: '1px solid var(--color-border-soft)', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                    textAlign: language === 'ar' ? 'right' : 'left',
                    backgroundColor: 'var(--color-card)',
                    color: 'var(--color-text-main)',
                    direction: language === 'ar' ? 'rtl' : 'ltr'
                  }}
                />
                <Line type="monotone" dataKey="count" stroke="var(--color-primary)" strokeWidth={4} dot={{ r: 6, fill: 'var(--color-primary)', strokeWidth: 2, stroke: 'var(--color-card)' }} activeDot={{ r: 8 }} />
              </LineChart>
            )}
          </ChartContainer>
        </div>
      </div>

      {/* Findings by Dept Chart */}
      <div className="glass-card p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <BarChart3 size={20} />
            </div>
            <h3 className="text-xl font-bold text-[var(--color-text-main)]">{t('reports.findingsByDepartment')}</h3>
          </div>
        </div>
        <div className="h-64 w-full min-w-0">
          <ChartContainer debugName="FindingsByDeptChart" minHeight={256}>
            {(width, height) => (
              <BarChart width={width} height={height} data={execData.findingsByDept} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border-soft)" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="department" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 'bold', fill: 'var(--color-text-muted)' }} 
                  width={100}
                  orientation={language === 'ar' ? 'right' : 'left'}
                />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  formatter={(value: any) => [formatNumber(value), t('reports.count')]}
                  contentStyle={{ 
                    borderRadius: '1rem', 
                    border: '1px solid var(--color-border-soft)', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                    textAlign: language === 'ar' ? 'right' : 'left',
                    backgroundColor: 'var(--color-card)',
                    color: 'var(--color-text-main)',
                    direction: language === 'ar' ? 'rtl' : 'ltr'
                  }}
                />
                <Bar dataKey="count" fill="var(--color-primary)" radius={language === 'ar' ? [10, 0, 0, 10] : [0, 10, 10, 0]} barSize={20}>
                  {execData.findingsByDept.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ChartContainer>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveCharts;
