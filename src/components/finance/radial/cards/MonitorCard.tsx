/**
 * MonitorCard — Finance sub-arc "MONITOR" comprehensive card.
 *
 * Shape-composed: HeroMetric (health score) + PillList (urgent bills) + MetricList (metrics).
 * Data via registry adapters + inline metric computation.
 */

import { useMemo } from 'react';
import {
  useNetWorthCurrent,
  useNetWorthTrend,
  useBudgetStatus,
  useIncomeSummary,
} from '@/hooks';
import { getMonday } from '@/utils/dateUtils';
import { fmtCurrency, fmtPct } from './shared/formatUtils';
import { CIRCULAR_ROOT_STYLE } from '../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList, MetricList } from '../shapes';
import {
  useFinanceHealthScoreAdapter,
  useFinanceUpcomingBillsAdapter,
  useSafeToSpendAdapter,
} from '../registry/adapters/financeAdapters';

export function MonitorCard() {
  const hero = useFinanceHealthScoreAdapter();
  const billsPills = useFinanceUpcomingBillsAdapter();
  const safeToSpend = useSafeToSpendAdapter();

  // Inline metrics not covered by adapters
  const periodStart = useMemo(() => getMonday(), []);
  const { data: netWorth } = useNetWorthCurrent();
  const { data: trend } = useNetWorthTrend(12);
  const { data: budget } = useBudgetStatus(periodStart);
  const { data: incomeData } = useIncomeSummary(periodStart);

  const nw = (netWorth as Record<string, unknown>)?.net_worth as number ?? 0;
  const trendPts = (trend ?? []) as Array<{ net_worth?: number }>;
  const prevNw = trendPts.length >= 2 ? (trendPts[trendPts.length - 2]?.net_worth ?? nw) : nw;
  const nwDelta = prevNw > 0 ? ((nw - prevNw) / prevNw) * 100 : 0;
  const spent = budget?.total_spent ?? 0;
  const totalIncome = (incomeData as Record<string, unknown>)?.total_income as number ?? 0;
  const savingsRate = totalIncome > 0 ? ((totalIncome - spent) / totalIncome) * 100 : 0;

  const metrics = [
    { label: 'Safe', value: fmtCurrency(safeToSpend.value as number ?? 0) },
    { label: 'Savings', value: `${savingsRate.toFixed(0)}%` },
    { label: 'NW', value: fmtPct(nwDelta) },
  ];

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={<HeroMetric {...hero} />}
        pillZone={[
          <PillList key="bills" {...billsPills} header="STATUS" />,
          <MetricList key="metrics" items={metrics} />,
        ]}
      />
    </div>
  );
}
