/**
 * ShapeRenderer — Maps ShapeType + props to the correct shape component.
 * Pure dispatch — no hooks, no state.
 */

import type {
  ShapeType,
  ShapeProps,
  HeroMetricShapeProps,
  PillListShapeProps,
  ProgressBarShapeProps,
  GaugeRingShapeProps,
  StatGridShapeProps,
} from '../registry/types';
import { HeroMetric, PillList, ProgressBar, GaugeRing, StatGrid } from '../shapes';

interface ShapeRendererProps {
  shape: ShapeType;
  props: ShapeProps;
}

export function ShapeRenderer({ shape, props }: ShapeRendererProps) {
  switch (shape) {
    case 'HeroMetric':
      return <HeroMetric {...(props as HeroMetricShapeProps)} />;
    case 'PillList':
      return <PillList {...(props as PillListShapeProps)} />;
    case 'ProgressBar':
      return <ProgressBar {...(props as ProgressBarShapeProps)} />;
    case 'GaugeRing':
      return <GaugeRing {...(props as GaugeRingShapeProps)} />;
    case 'StatGrid':
      return <StatGrid {...(props as StatGridShapeProps)} />;
    default:
      return null;
  }
}
