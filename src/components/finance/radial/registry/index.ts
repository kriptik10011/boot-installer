/**
 * Registry barrel — re-exports for clean imports.
 */

export type {
  DataSourceId,
  ActionId,
  DataSourceEntry,
  ActionEntry,
  ArcCardConfig,
  ShapeType,
  ZoneType,
  ShapeProps,
  HeroMetricShapeProps,
  PillListShapeProps,
  ProgressBarShapeProps,
  GaugeRingShapeProps,
  StatGridShapeProps,
} from './types';
export { DEFAULT_ARC_CARD_CONFIG } from './types';
export { getDataSource, getRegisteredSources, getSourcesForDomain, getFeaturedSources, resolveArcConfig } from './dataSourceRegistry';
export { getAction, getRegisteredActions, getActionsForDomain } from './actionRegistry';
