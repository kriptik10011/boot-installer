/**
 * BudgetCard — Finance sub-arc "BUDGET" comprehensive card.
 *
 * Shape-composed: HeroMetric (spent + pace) + two detail slots (categories | metrics).
 * Data via registry adapters.
 */

import { CIRCULAR_ROOT_STYLE } from '../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList, MetricList } from '../shapes';
import {
  useBudgetHeroAdapter,
  useBudgetCategoriesAdapter,
  useSafeToSpendAdapter,
  useSpendingVelocityAdapter,
} from '../registry/adapters/financeAdapters';

export function BudgetCard() {
  const hero = useBudgetHeroAdapter();
  const categories = useBudgetCategoriesAdapter();
  const safeToSpend = useSafeToSpendAdapter();
  const velocity = useSpendingVelocityAdapter();

  const metrics = [
    { label: 'Safe', value: String(safeToSpend.value) },
    { label: 'Rate', value: velocity.sublabel ?? 'On track' },
  ];

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={<HeroMetric {...hero} />}
        pillZone={[
          <PillList key="cats" {...categories} header="CATEGORIES" maxItems={6} />,
          <MetricList key="metrics" items={metrics} />,
        ]}
      />
    </div>
  );
}
