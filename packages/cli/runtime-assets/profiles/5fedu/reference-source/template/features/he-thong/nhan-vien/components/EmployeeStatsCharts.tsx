import React from 'react';
import { txt } from '@/lib/text';
import {
  Users, TrendingUp, PieChart as PieChartIcon, BarChart3,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from 'recharts';
import ChartTooltip from '@/components/ui/ChartTooltip';

export interface EmployeeStatsChartsProps {
  chartsVisible: boolean;
  chartHeight: number;
  isMdUp: boolean;
  primaryHex: string;
  deptData: Array<{ name: string; value: number }>;
  statusData: Array<{ name: string; value: number; fill: string; key?: string }>;
  hiringData: Array<{ label: string; count: number }>;
  genderData: Array<{ name: string; value: number; fill: string }>;
  DEPT_COLORS: string[];
  deptIdByName: Record<string, string>;
  onDeptDrillDown?: (deptId: string) => void;
  onStatusDrillDown?: (status: string) => void;
}

const EmployeeStatsCharts: React.FC<EmployeeStatsChartsProps> = ({
  chartsVisible,
  chartHeight,
  isMdUp,
  primaryHex,
  deptData,
  statusData,
  hiringData,
  genderData,
  DEPT_COLORS,
  deptIdByName,
  onDeptDrillDown,
  onStatusDrillDown,
}) => {
  if (!chartsVisible) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {deptData.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-3.5">
            <div className="flex items-center gap-2 mb-3">
              <PieChartIcon size={14} className="text-primary" aria-hidden />
              <h3 className="text-xs font-semibold text-foreground">{txt('employee.stats.departmentChart')}</h3>
            </div>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie
                  data={deptData}
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={38}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                  onClick={(data: { name: string }) => {
                    const id = deptIdByName[data.name];
                    if (id && onDeptDrillDown) onDeptDrillDown(id);
                  }}
                  style={{ cursor: onDeptDrillDown ? 'pointer' : 'default' }}
                >
                  {deptData.map((_, i) => (
                    <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px' }}
                  formatter={(value: string) => (
                    <span className="text-muted-foreground text-caption">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-card rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} className="text-primary" />
            <h3 className="text-xs font-semibold text-foreground">{txt('employee.stats.statusChart')}</h3>
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={statusData} barSize={isMdUp ? 32 : 28}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="value"
                radius={[6, 6, 0, 0]}
                name={txt('employee.stats.quantity')}
                onClick={(data: { key?: string }) => {
                  if (data.key != null && onStatusDrillDown) onStatusDrillDown(data.key);
                }}
                style={{ cursor: onStatusDrillDown ? 'pointer' : 'default' }}
              >
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-3.5 md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-primary" />
            <h3 className="text-xs font-semibold text-foreground">{txt('employee.stats.trendChart')}</h3>
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={hiringData}>
              <defs>
                <linearGradient id="colorHire" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primaryHex} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={primaryHex} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="count"
                name={txt('employee.stats.newHires')}
                stroke={primaryHex}
                strokeWidth={2}
                fill="url(#colorHire)"
                dot={{ r: 3, fill: primaryHex, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: primaryHex, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {genderData.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-3.5">
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-pink-500" />
              <h3 className="text-xs font-semibold text-foreground">{txt('employee.stats.genderChart')}</h3>
            </div>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie
                  data={genderData}
                  cx="50%"
                  cy="50%"
                  outerRadius={isMdUp ? 75 : 70}
                  innerRadius={isMdUp ? 42 : 38}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                  label={
                    isMdUp
                      ? ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`
                      : false
                  }
                  labelLine={false}
                >
                  {genderData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px' }}
                  formatter={(value: string) => (
                    <span className="text-muted-foreground text-caption">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
    </div>
  );
};

export default EmployeeStatsCharts;
