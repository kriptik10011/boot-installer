/**
 * Skeleton Component
 *
 * Reusable loading placeholder that matches content shape.
 * Uses pulse animation with dark theme colors per UX decisions:
 * - Skeleton loaders matching content shape, never block
 * - No spinners blocking UI for routine operations
 * - Appears instantly while data loads (100ms rule)
 */

interface SkeletonProps {
  /** Shape variant */
  variant?: 'text' | 'rect' | 'circle';
  /** Width — Tailwind class or CSS value */
  width?: string;
  /** Height — Tailwind class or CSS value */
  height?: string;
  /** Additional Tailwind classes */
  className?: string;
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-slate-700/60 rounded';

  const variantClasses: Record<string, string> = {
    text: 'h-4 rounded',
    rect: 'rounded-lg',
    circle: 'rounded-full',
  };

  // Default dimensions per variant
  const defaultWidth = width ?? (variant === 'circle' ? 'w-10' : 'w-full');
  const defaultHeight =
    height ??
    (variant === 'text' ? 'h-4' : variant === 'circle' ? 'h-10' : 'h-20');

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${defaultWidth} ${defaultHeight} ${className}`}
    />
  );
}
