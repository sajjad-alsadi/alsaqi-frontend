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
    <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col group transition-all hover:shadow-xl hover:shadow-slate-200/50">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-[var(--color-primary)] transition-colors">
          <BarChartIcon size={20} />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text-main)] tracking-tight">{t('systemErrorLogs.errorTrends')}</h2>
      </div>
      
      {data.length > 0 ? (
        <div className="flex-1 min-h-[250px] w-full">
          <ChartContainer debugName="SystemErrorAnalyticsChart" minHeight={250}>
            {(width, height) => (
              <BarChart width={width} height={height} data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '12px' }} />
                <Bar radius={[4, 4, 0, 0]} dataKey="error" fill="#ef4444" name={t('systemErrorLogs.error')} />
                <Bar radius={[4, 4, 0, 0]} dataKey="warning" fill="#f59e0b" name={t('systemErrorLogs.warning')} />
                <Bar radius={[4, 4, 0, 0]} dataKey="info" fill="#3b82f6" name={t('systemErrorLogs.info')} />
              </BarChart>
            )}
          </ChartContainer>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-300 font-bold border-2 border-dashed border-slate-50 rounded-3xl">
          <Activity size={48} className="mb-4 opacity-20" />
          {t('systemErrorLogs.noAnalyticsData')}
        </div>
      )}
    </div>
  );
};

export default SystemErrorAnalytics;
