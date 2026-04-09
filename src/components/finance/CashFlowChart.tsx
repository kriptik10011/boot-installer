/**
 * CashFlowChart — recharts AreaChart for cash flow forecast.
 *
 * Research basis: River of Time — today's data sharp, future progressively lighter.
 * Monarch Money pattern — making complex data feel simple and beautiful.
 */

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface DailyProjection {
  date: string;
  projected_balance: number;
  income?: number;
  expenses?: number;
}

interface CashFlowChartProps {
  projections: DailyProjection[];
  lowBalanceThreshold?: number;
}

export function CashFlowChart({
  projections,
  lowBalanceThreshold = 500,
}: CashFlowChartProps) {
  const chartData = useMemo(
    () =>
      projections.map((p) => ({
        date: p.date.slice(5), // "02-15" format
        balance: Math.round(p.projected_balance),
        isLow: p.projected_balance < lowBalanceThreshold,
      })),
    [projections, lowBalanceThreshold]
  );

  const minBalance = useMemo(
    () => Math.min(...chartData.map((d) => d.balance)),
    [chartData]
  );

  const hasLowBalance = minBalance < lowBalanceThreshold;

  if (chartData.length === 0) return null;

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={hasLowBalance ? '#f59e0b' : '#10b981'}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={hasLowBalance ? '#f59e0b' : '#10b981'}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1c2d4a',
              border: '1px solid rgba(100,116,139,0.3)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value) => [`$${(Number(value) || 0).toLocaleString()}`, 'Balance']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          {lowBalanceThreshold > 0 && (
            <ReferenceLine
              y={lowBalanceThreshold}
              stroke="#f59e0b"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
          )}
          <Area
            type="monotone"
            dataKey="balance"
            stroke={hasLowBalance ? '#f59e0b' : '#10b981'}
            fill="url(#balanceGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
