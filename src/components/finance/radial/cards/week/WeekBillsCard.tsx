/**
 * WeekBillsCard — Week sub-arc "BILLS" card.
 *
 * Shape-composed: HeroMetric (bill total + count) + PillList (urgency-sorted bills).
 * Data via registry adapters — no inline hook calls.
 */

import { CIRCULAR_ROOT_STYLE } from '../../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList } from '../../shapes';
import { useWeekBillTotalAdapter, useUpcomingBillsAdapter } from '../../registry/adapters/weekAdapters';

export function WeekBillsCard() {
  const hero = useWeekBillTotalAdapter();
  const pills = useUpcomingBillsAdapter();

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={<HeroMetric {...hero} />}
        pillZone={<PillList {...pills} header="DUE SOON" />}
      />
    </div>
  );
}
