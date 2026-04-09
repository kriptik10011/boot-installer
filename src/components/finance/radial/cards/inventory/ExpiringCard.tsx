/**
 * ExpiringCard — Inventory sub-arc "EXPIRING" preview card.
 *
 * Shape-composed: HeroMetric (count + urgency) + PillList (expiring items).
 * Data via registry adapters — no inline hook calls.
 */

import { CIRCULAR_ROOT_STYLE } from '../../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList } from '../../shapes';
import { useExpiringCountAdapter, useExpiringSoonAdapter } from '../../registry/adapters/inventoryAdapters';

export function ExpiringCard() {
  const hero = useExpiringCountAdapter();
  const pills = useExpiringSoonAdapter();

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={<HeroMetric {...hero} />}
        pillZone={<PillList {...pills} />}
      />
    </div>
  );
}
