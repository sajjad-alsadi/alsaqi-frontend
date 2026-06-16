import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useTranslation } from 'react-i18next';
import ChartContainer from '../../components/ChartContainer';
import { BarChart as BarChartIcon, Activity } from 'lucide-react';

interface AnalyticsData {
  severity: string;
  count: number;
  date: string;
}

interface Props {
  data: AnalyticsData[];
}

const SystemErrorAnalytics: React.FC<Props> = ({ data }) => {
  const { t } = useTranslation();

  const chartData = data.reduce((acc: any, curr) => {
    const existing = acc.find((item: any) => item.date === curr.date);
    if (existing) {
      existing[curr.severity] = curr.count;
    } else {
      acc.push({ date: curr.date, [curr.severity]: curr.count });
    }
    return acc;
  }, []);

  return (
    <div className="bg-[var(--color-card)] p-6 rounded-2xl border border-[var(--color-border-soft)] shadow-sm flex flex-col transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-bg-soft)] flex items-center justify-center text-[var(--color-text-muted)]">
          <BarChartIcon size={18} />
        </div>
        <h2 className="text-base font-semibold text-[var(--color-text-main)]">{t('systemErrorLogs.errorTrends')}</h2>
      </div>
      
      {data.length > 0 ? (
        <div className="flex-1 min-h-[250px] w-full">
          <ChartContainer debugName="SystemErrorAnalyticsChart" minHeight={250}>
            {(width, height) => (
              <BarChart width={width} height={height} data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-soft)" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 10, fontWeight: 500 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 10, fontWeight: 500 }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '0.75rem', border: '1px solid var(--color-border-soft)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontWeight: 500 }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '16px', fontWeight: 500, fontSize: '12px' }} />
                <Bar radius={[4, 4, 0, 0]} dataKey="error" fill="var(--color-danger)" name={t('systemErrorLogs.error')} />
                <Bar radius={[4, 4, 0, 0]} dataKey="warning" fill="var(--color-warning)" name={t('systemErrorLogs.warning')} />
                <Bar radius={[4, 4, 0, 0]} dataKey="info" fill="var(--color-info)" name={t('systemErrorLogs.info')} />
              </BarChart>
            )}
          </ChartContainer>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)] border-2 border-dashed border-[var(--color-border-soft)] rounded-xl">
          <Activity size={40} className="mb-3 opacity-30" />
          <span className="text-sm">{t('systemErrorLogs.noAnalyticsData')}</span>
        </div>
      )}
    </div>
  );
};

export default SystemErrorAnalytics;
