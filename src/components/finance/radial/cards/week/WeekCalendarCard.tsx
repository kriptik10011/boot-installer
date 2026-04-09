/**
 * WeekCalendarCard -> WeekRhythmCard — Week sub-arc "RHYTHM" card.
 *
 * Shape-composed: HeroMetric (free hours + trend) + PillList (patterns).
 * Data via registry adapters — no inline computation.
 */

import { CIRCULAR_ROOT_STYLE } from '../../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList } from '../../shapes';
import { useWeekFreeHoursAdapter, useWeekPatternsAdapter } from '../../registry/adapters/weekAdapters';

export function WeekCalendarCard() {
  const hero = useWeekFreeHoursAdapter();
  const pills = useWeekPatternsAdapter();

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={<HeroMetric {...hero} />}
        pillZone={<PillList {...pills} header="PATTERNS" />}
      />
    </div>
  );
}
