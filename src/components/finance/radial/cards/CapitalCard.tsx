/**
 * CapitalCard — Finance sub-arc "CAPITAL" comprehensive card.
 *
 * Shape-composed: HeroMetric (portfolio value + YTD) + two PillLists (holdings | accounts).
 * Data via registry adapters. Allocation uses inline hook (single consumer).
 */

import { usePortfolioAllocation } from '@/hooks';
import { CIRCULAR_ROOT_STYLE } from '../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList } from '../shapes';
import { usePortfolioValueAdapter, useInvestmentAccountsAdapter } from '../registry/adapters/financeAdapters';

const ALLOC_COLORS = ['#f59e0b', '#fbbf24', '#fcd34d', '#d97706', '#b45309', '#3b82f6', '#8b5cf6', '#22d3ee'];

export function CapitalCard() {
  const hero = usePortfolioValueAdapter();
  const accountsPills = useInvestmentAccountsAdapter();

  // Allocation — single consumer, inline transform
  const { data: allocation } = usePortfolioAllocation();
  const rawAlloc = Array.isArray(allocation)
    ? allocation
    : (allocation as Record<string, unknown>)?.allocations;
  const allocData: Array<{ asset_class: string; current_pct?: number }> =
    Array.isArray(rawAlloc) ? rawAlloc : [];

  const allocItems = allocData.slice(0, 5).map((a, i) => ({
    label: a.asset_class ?? 'Unknown',
    badge: `${Math.round(a.current_pct ?? 0)}%`,
    dotColor: ALLOC_COLORS[i % ALLOC_COLORS.length],
  }));

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={<HeroMetric {...hero} />}
        pillZone={[
          <PillList
            key="holdings"
            items={allocItems}
            header="HOLDINGS"
            headerColor="#a78bfa"
            emptyMessage="No allocation"
            maxItems={5}
          />,
          <PillList key="accounts" {...accountsPills} header="ACCOUNTS" maxItems={5} />,
        ]}
      />
    </div>
  );
}
