/**
 * Widget registry — unified ArcCardRenderer for all arcs.
 * Bezels are pinned to arc domain (not swappable).
 *
 * Phase D: ArcCardRenderer replaces 4 bespoke widgets.
 * Config-driven via arcCardConfig in store.
 */

import type { ReactNode } from 'react';
import type { ArcPosition } from '../utils/arcGeometry';
import { ArcCardRenderer } from './ArcCardRenderer';
import { WeekBezelSvg } from './bezels/WeekBezel';
import { MealsBezelSvg } from './bezels/MealsBezel';
import { FinanceBezelSvg } from './bezels/FinanceBezel';
import { InventoryBezelSvg, InventoryWasteBezelSvg } from './bezels/InventoryBezel';

// ── Public API ──

/**
 * Returns the unified ArcCardRenderer for any arc position.
 * Config is read from store inside the renderer (per-arc selector).
 */
export function getWidgetsForArc(
  arc: ArcPosition,
): { widgets: ReactNode[]; labels: string[] } {
  const arcLabels: Record<ArcPosition, string> = {
    north: 'Week',
    east: 'Meals',
    south: 'Finance',
    west: 'Inventory',
  };

  return {
    widgets: [<ArcCardRenderer key={`arc-${arc}`} arc={arc} />],
    labels: [arcLabels[arc]],
  };
}

/**
 * Bezel SVGs are pinned to arc domain — they visualize domain-specific data
 * and do not follow widget assignment.
 */
export function getBezelSvgForArc(
  arc: ArcPosition,
  size: number,
): ReactNode | undefined {
  switch (arc) {
    case 'north': return <WeekBezelSvg size={size} />;
    case 'south': return <FinanceBezelSvg size={size} />;
    case 'east': return <MealsBezelSvg size={size} />;
    case 'west': return (
      <g>
        <InventoryBezelSvg size={size} />
        <InventoryWasteBezelSvg size={size} />
      </g>
    );
  }
}
