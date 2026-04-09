/**
 * Registry types for the arc card customization system.
 * Central type definitions used by data source registry, action registry,
 * adapters, and ArcCardRenderer.
 */

// Inline type to avoid circular dependency: defaults → registry/types → arcGeometry → appStore → defaults
// Must stay in sync with ArcPosition in arcGeometry.ts
type ArcPosition = 'north' | 'east' | 'south' | 'west';
export type { ArcPosition as RegistryArcPosition };

// ── Constants ──

export const MAX_DETAIL_SLOTS = 6;
export const MAX_ACTION_SLOTS = 3;

// ── Shape types ──

export type ShapeType = 'HeroMetric' | 'PillList' | 'ProgressBar' | 'GaugeRing' | 'StatGrid';
export type ZoneType = 'hero' | 'detail';

// ── Data source IDs ──

export type DataSourceId =
  // Week (North)
  | 'week-health-score'
  | 'upcoming-events'
  | 'upcoming-bills'
  | 'meal-plan-status'
  | 'week-summary'
  | 'cross-feature-insights'
  | 'event-intelligence'
  | 'habit-status'
  | 'week-day-health'
  // Week — sub-arc card adapters
  | 'week-event-count'
  | 'week-character'
  | 'week-free-hours'
  | 'week-patterns'
  | 'week-bill-total'
  // Meals (East)
  | 'next-meal'
  | 'ingredients-needed'
  | 'meal-coverage'
  | 'meal-gaps'
  | 'meal-intelligence'
  | 'ingredient-variety'
  | 'recipe-favorites'
  | 'low-stock-meal-alerts'
  // Meals — sub-arc card adapters
  | 'cooking-streak'
  | 'cooking-patterns'
  // Finance (South)
  | 'finance-health-score'
  | 'finance-upcoming-bills'
  | 'budget-pace'
  | 'nearest-goal'
  | 'safe-to-spend'
  | 'net-worth'
  | 'spending-velocity'
  | 'emergency-fund'
  | 'savings-rate'
  | 'subscription-total'
  | 'debt-summary'
  // Finance — sub-arc card adapters
  | 'budget-hero'
  | 'budget-categories'
  | 'top-goals'
  | 'debt-accounts'
  | 'portfolio-value'
  | 'investment-accounts'
  // Inventory (West)
  | 'inventory-health'
  | 'at-risk-meals'
  | 'expiring-soon'
  | 'low-stock-items'
  | 'food-group-balance'
  | 'pantry-suggestions'
  | 'restocking-predictions'
  | 'inventory-location-counts'
  // Inventory — sub-arc card adapters
  | 'expiring-count';

// ── Action IDs ──

export type ActionId =
  | 'add-event'
  | 'add-bill'
  | 'browse-recipes'
  | 'start-cooking'
  | 'view-finances'
  | 'view-inventory'
  | 'view-week'
  | 'add-meal';

// ── Shape props unions ──

export interface HeroMetricShapeProps {
  value: string | number;
  label: string;
  sublabel?: string;
  color?: string;
  computedColor?: (value: string | number) => string;
}

export interface PillListShapeProps {
  items: readonly { label: string; badge?: string; dotColor?: string }[];
  header?: string;
  headerColor?: string;
  emptyMessage?: string;
  maxItems?: number;
}

export interface ProgressBarShapeProps {
  progress: number;
  label?: string;
  sublabel?: string;
  color: string;
  showPct?: boolean;
}

export interface GaugeRingShapeProps {
  progress: number;
  color?: string;
  label?: string;
  compact?: boolean;
}

export interface StatGridShapeProps {
  stats: readonly { value: string | number; label: string; color?: string }[];
  columns?: 2 | 3;
  maxItems?: number;
}

export type ShapeProps =
  | HeroMetricShapeProps
  | PillListShapeProps
  | ProgressBarShapeProps
  | GaugeRingShapeProps
  | StatGridShapeProps;

// ── Registry entry types ──

export interface DataSourceEntry {
  id: DataSourceId;
  label: string;
  description: string;
  domain: 'week' | 'meals' | 'finance' | 'inventory';
  shape: ShapeType;
  zones: readonly ZoneType[];
  cap: number;
  featured?: boolean;
  useAdapter: () => ShapeProps;
  placeholder: () => ShapeProps;
}

export interface ActionEntry {
  id: ActionId;
  label: string;
  domain: 'week' | 'meals' | 'finance' | 'inventory';
  variant: 'amber' | 'cyan' | 'orange' | 'green' | 'violet' | 'emerald' | 'slate';
}

// ── Config types (stored in Zustand) ──

export interface ArcCardConfig {
  hero: DataSourceId;
  actions: readonly ActionId[];
  details: readonly DataSourceId[];
}

export const DEFAULT_ARC_CARD_CONFIG: Record<ArcPosition, ArcCardConfig> = {
  north: {
    hero: 'week-health-score',
    actions: ['add-event', 'add-bill'],
    details: ['upcoming-events', 'upcoming-bills', 'meal-plan-status'],
  },
  east: {
    hero: 'next-meal',
    actions: ['browse-recipes', 'start-cooking'],
    details: ['ingredients-needed', 'meal-coverage'],
  },
  south: {
    hero: 'finance-health-score',
    actions: ['view-finances'],
    details: ['finance-upcoming-bills', 'budget-pace', 'nearest-goal'],
  },
  west: {
    hero: 'inventory-health',
    actions: ['view-inventory'],
    details: ['at-risk-meals', 'expiring-soon'],
  },
};
