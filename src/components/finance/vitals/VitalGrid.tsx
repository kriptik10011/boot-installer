/**
 * VitalGrid — 2-column CSS Grid with behavioral sizing.
 *
 * Compact vitals take 1 cell. Standard vitals take 1 cell.
 * Large vitals span 2 columns (full width).
 * role="list" with keyboard nav between vitals.
 */

import type { VitalSize } from '@/types/vitals';

interface VitalGridProps {
  children: React.ReactNode;
  /** Map of vital index to size for grid layout hints */
  sizes?: Record<string, VitalSize>;
}

export function VitalGrid({ children }: VitalGridProps) {
  return (
    <div
      className="grid grid-cols-2 gap-2 px-3"
      role="list"
      aria-label="Financial vitals"
    >
      {children}
    </div>
  );
}

/**
 * Grid item wrapper — applies col-span based on vital size.
 */
interface VitalGridItemProps {
  size: VitalSize;
  children: React.ReactNode;
}

export function VitalGridItem({ size, children }: VitalGridItemProps) {
  const spanClass = size === 'large' ? 'col-span-2' : 'col-span-1';
  return <div className={spanClass}>{children}</div>;
}
