/**
 * WeekSummaryCard — Week sub-arc "SUMMARY" card (Intelligence + Narrative Hub).
 *
 * Shape-composed: HeroMetric (week character + narrative) + PillList (cross-feature insights).
 * Hero sublabel shows the first insight; pill zone shows remaining insights (deduplicated).
 * Data via registry adapters — no inline hook calls.
 */

import { CIRCULAR_ROOT_STYLE } from '../../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList } from '../../shapes';
import { useWeekCharacterAdapter, useCrossFeatureInsightsAdapter } from '../../registry/adapters/weekAdapters';

export function WeekSummaryCard() {
  const hero = useWeekCharacterAdapter();
  const pills = useCrossFeatureInsightsAdapter();

  // Hero sublabel already shows the first insight — skip it in the pill zone
  const dedupedPills = {
    ...pills,
    items: pills.items.slice(1),
    header: 'INSIGHTS',
  };

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={<HeroMetric {...hero} />}
        pillZone={<PillList {...dedupedPills} />}
      />
    </div>
  );
}
