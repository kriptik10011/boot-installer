/**
 * WeekEventsCard — Week sub-arc "EVENTS" card.
 *
 * Shape-composed: HeroMetric (event count + today status) + PillList (upcoming events).
 * Data via registry adapters — no inline hook calls.
 */

import { CIRCULAR_ROOT_STYLE } from '../../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList } from '../../shapes';
import { useWeekEventCountAdapter, useUpcomingEventsAdapter } from '../../registry/adapters/weekAdapters';

export function WeekEventsCard() {
  const hero = useWeekEventCountAdapter();
  const pills = useUpcomingEventsAdapter();

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={<HeroMetric {...hero} />}
        pillZone={<PillList {...pills} header="UPCOMING" />}
      />
    </div>
  );
}
