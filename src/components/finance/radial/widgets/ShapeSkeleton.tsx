/**
 * ShapeSkeleton — Loading placeholder variants for each shape type.
 * Pulsing gray boxes that match approximate shape dimensions.
 */

import type { ShapeType } from '../registry/types';

interface ShapeSkeletonProps {
  shape: ShapeType;
  error?: boolean;
}

const SKELETON_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(148, 163, 184, 0.08)',
  borderRadius: '9999px',
};

const ERROR_BG: React.CSSProperties = {
  backgroundColor: 'rgba(251, 113, 133, 0.08)',
};

export function ShapeSkeleton({ shape, error }: ShapeSkeletonProps) {
  const base = error ? { ...SKELETON_STYLE, ...ERROR_BG } : SKELETON_STYLE;
  const pulseClass = error ? '' : 'animate-pulse';

  switch (shape) {
    case 'HeroMetric':
      return (
        <div className="flex flex-col items-center" style={{ gap: '0.5cqi' }}>
          <div className={pulseClass} style={{ ...base, width: '8cqi', height: '1.5cqi' }} />
          <div className={pulseClass} style={{ ...base, width: '12cqi', height: '4cqi' }} />
          <div className={pulseClass} style={{ ...base, width: '6cqi', height: '1.2cqi' }} />
        </div>
      );
    case 'PillList':
      return (
        <div className="flex flex-col" style={{ gap: '0.6cqi', padding: '1.5cqi 2cqi' }}>
          <div className={pulseClass} style={{ ...base, width: '5cqi', height: '1.2cqi' }} />
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ ...base, width: '100%', height: '1.8cqi' }} />
          ))}
        </div>
      );
    case 'ProgressBar':
      return (
        <div className="flex flex-col" style={{ gap: '0.3cqi' }}>
          <div className={pulseClass} style={{ ...base, width: '8cqi', height: '1.2cqi' }} />
          <div className={pulseClass} style={{ ...base, width: '100%', height: '1.5cqi', borderRadius: '0.75cqi' }} />
        </div>
      );
    case 'GaugeRing':
      return (
        <div className="flex flex-col items-center" style={{ gap: '0.3cqi' }}>
          <div className={pulseClass} style={{ ...base, width: '10cqi', height: '10cqi', borderRadius: '50%' }} />
          <div className={pulseClass} style={{ ...base, width: '6cqi', height: '1.2cqi' }} />
        </div>
      );
    case 'StatGrid':
      return (
        <div className="grid grid-cols-2" style={{ gap: '1.5cqi' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center" style={{ gap: '0.2cqi' }}>
              <div className={pulseClass} style={{ ...base, width: '4cqi', height: '2.5cqi' }} />
              <div className={pulseClass} style={{ ...base, width: '3cqi', height: '1cqi' }} />
            </div>
          ))}
        </div>
      );
    default:
      return <div className={pulseClass} style={{ ...base, width: '100%', height: '4cqi' }} />;
  }
}
