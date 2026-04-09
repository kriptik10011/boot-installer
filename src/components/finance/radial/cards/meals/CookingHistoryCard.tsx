/**
 * CookingHistoryCard — Meals sub-arc "COOKING" preview card.
 *
 * Shape-composed: HeroMetric (streak count) + two PillLists (favorites | patterns).
 * Data via registry adapters — no inline hook calls.
 */

import { CIRCULAR_ROOT_STYLE } from '../../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList } from '../../shapes';
import {
  useRecipeFavoritesAdapter,
  useCookingStreakAdapter,
  useCookingPatternsAdapter,
} from '../../registry/adapters/mealsAdapters';

export function CookingHistoryCard() {
  const hero = useCookingStreakAdapter();
  const favorites = useRecipeFavoritesAdapter();
  const patterns = useCookingPatternsAdapter();

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={<HeroMetric {...hero} />}
        pillZone={[
          <PillList key="favs" {...favorites} header="FAVORITES" maxItems={4} />,
          <PillList key="patterns" {...patterns} header="STREAKS" />,
        ]}
      />
    </div>
  );
}
