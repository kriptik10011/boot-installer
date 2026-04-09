/**
 * GoalsCard — Finance sub-arc "GOALS" comprehensive card.
 *
 * Shape-composed: HeroMetric (nearest goal %) + TwoColumnLayout (goals | debt).
 * Data via registry adapters — no inline hook calls.
 */

import { CIRCULAR_ROOT_STYLE } from '../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList, TwoColumnLayout } from '../shapes';
import {
  useNearestGoalAdapter,
  useTopGoalsAdapter,
  useDebtAccountsAdapter,
} from '../registry/adapters/financeAdapters';

export function GoalsCard() {
  const nearest = useNearestGoalAdapter();
  const goalsPills = useTopGoalsAdapter();
  const debtPills = useDebtAccountsAdapter();

  const heroPct = Math.round((nearest.progress ?? 0) * 100);

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={
          <HeroMetric
            value={`${heroPct}%`}
            label={nearest.label ?? 'No goals'}
            sublabel={heroPct >= 100 ? 'FUNDED' : `${heroPct}% funded`}
            color={nearest.color}
          />
        }
        pillZone={[
          <PillList key="goals" {...goalsPills} maxItems={5} />,
          <PillList key="debt" {...debtPills} maxItems={5} />,
        ]}
      />
    </div>
  );
}
