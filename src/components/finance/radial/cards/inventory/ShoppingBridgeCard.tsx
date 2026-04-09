/**
 * ShoppingBridgeCard — Inventory sub-arc "CUSTOM" placeholder card.
 *
 * Blank card reserving a customizable slot for future user-defined content.
 * Uses CircularCardLayout for template compliance.
 */

import { CIRCULAR_ROOT_STYLE, SUB_ARC_ACCENTS } from '../../cardTemplate';
import { CircularCardLayout, HeroMetric } from '../../shapes';

export function ShoppingBridgeCard() {
  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      <CircularCardLayout
        hero={<HeroMetric value="Custom" label="INVENTORY" sublabel="Coming soon" color={SUB_ARC_ACCENTS.inventory} />}
      />
    </div>
  );
}
