/**
 * JunctionWidgets — Re-export shim.
 *
 * Components have been split into individual junction files in ../junctions/.
 * This shim maintains backward compatibility for consumers.
 */

import { Suspense, type ReactNode } from 'react';
import type { JunctionId, ArcPosition } from '../utils/arcGeometry';
import type { BezelArc } from '../circular';
import { lerpHex } from '../utils/bezelHelpers';

// Import components from new junction files
import { ShoppingJunctionWidget, ShoppingBezelSvg } from '../junctions/ShoppingJunction';
import { WeeklyReviewWizardWidget } from '../junctions/QuickActionsJunction';
import { HabitJunctionWidget } from '../junctions/HabitJunction';
import { InventoryQuickAddWidget, InventoryBulkAddWidget, InventoryAddBezelSvgConnected } from '../junctions/InventoryJunction';
import { SettingsGeneralWidget, SettingsCustomizeWidget, SettingsLatticeWidget } from '../settings/SettingsPanel';

// ---- Types (kept for backward compat with Carousel.tsx) ----

export interface JunctionData {
  shoppingItems: Array<{ id: number; name: string; checked: boolean }>;
  habits: Array<{
    id: number;
    habit_name: string;
    current_streak: number;
    trend_score: number;
  }>;
  /** Callback when wizard completes — deactivates NE junction */
  onCloseReview?: () => void;
}

export const JUNCTION_CARD_COUNT: Record<JunctionId, number> = {
  nw: 1,
  ne: 1, // Weekly Review wizard only
  se: 1,
  sw: 3,
};

// ---- Sub-arc junction resolution ----

export function getSubArcJunctionCardCount(mainArc: ArcPosition, junction: JunctionId): number {
  if (mainArc === 'west' && junction === 'sw') return 2;
  return 1;
}

export function getSubArcWidgetsForJunction(
  mainArc: ArcPosition,
  junction: JunctionId,
): { widgets: ReactNode[]; labels: string[]; bezelArcs?: BezelArc[]; bezelSvg?: ReactNode } {
  if (mainArc === 'west' && junction === 'sw') {
    return {
      labels: ['Quick Add', 'Bulk Add'],
      widgets: [
        <InventoryQuickAddWidget key="inv-quick-add" />,
        <InventoryBulkAddWidget key="inv-bulk-add" />,
      ],
      bezelSvg: <InventoryAddBezelSvgConnected size={400} />,
    };
  }
  return { widgets: [], labels: [] };
}

// ---- Main junction registry ----

export function getWidgetsForJunction(
  junction: JunctionId,
  data: JunctionData,
  _onNavigate?: (page: number) => void,
): { widgets: ReactNode[]; labels: string[]; bezelArcs?: BezelArc[]; bezelSvg?: ReactNode } {
  switch (junction) {
    case 'nw': {
      const total = data.shoppingItems.length;
      const checkedCount = data.shoppingItems.filter((i) => i.checked).length;
      const progress = total > 0 ? checkedCount / total : 0;
      const ringColor = progress <= 0.5
        ? lerpHex('#b45309', '#fbbf24', progress * 2)
        : lerpHex('#fbbf24', '#4ade80', (progress - 0.5) * 2);
      return {
        labels: [total > 0 ? `${checkedCount}/${total} items` : 'Empty'],
        widgets: [<ShoppingJunctionWidget key="shop-junction" />],
        bezelSvg: total > 0
          ? <ShoppingBezelSvg progress={progress} size={400} color={ringColor} />
          : undefined,
      };
    }
    case 'ne':
      return {
        labels: ['Weekly Review'],
        widgets: [
          <Suspense key="review-wizard" fallback={null}>
            <WeeklyReviewWizardWidget onClose={data.onCloseReview!} />
          </Suspense>,
        ],
      };
    case 'se':
      return {
        labels: ['Habits'],
        widgets: [<HabitJunctionWidget key="habit-junction" />],
      };
    case 'sw':
      return {
        labels: ['General', 'Domains', 'Shaders'],
        widgets: [
          <SettingsGeneralWidget key="settings-general" />,
          <SettingsCustomizeWidget key="settings-customize" />,
          <SettingsLatticeWidget key="settings-lattice" />,
        ],
      };
  }
}
