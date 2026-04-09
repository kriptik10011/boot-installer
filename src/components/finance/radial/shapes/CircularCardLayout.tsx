/**
 * CircularCardLayout — Reusable layout wrapper for shape-composed circular cards.
 *
 * Content is vertically centered within the circular safe zone.
 * Detail zone uses smart grid layout:
 * - 1 item:  full width
 * - 2 items: side by side (1fr 1fr)
 * - 3 items: 2 top + 1 spanning bottom
 * - 4+ items: 2-column auto-rows grid
 *
 * Form mode: When `formZone` is provided, it replaces the pill grid
 * with a single-column scrollable area for inline form fields.
 */

import { Children, type ReactNode } from 'react';

interface CircularCardLayoutProps {
  hero: ReactNode;
  pillZone?: ReactNode;
  /** When set, replaces pillZone with a scrollable single-column form area */
  formZone?: ReactNode;
  className?: string;
}

export function CircularCardLayout({ hero, pillZone, formZone, className }: CircularCardLayoutProps) {
  const children = pillZone != null && formZone == null
    ? (Array.isArray(pillZone) ? pillZone.filter(Boolean) : Children.toArray(pillZone).filter(Boolean))
    : [];
  const count = children.length;

  return (
    <div
      className={`flex flex-col items-center h-full w-full ${className ?? ''}`}
      style={{
        paddingTop: '8cqi',
        paddingBottom: '16cqi',
        justifyContent: 'flex-start',
      }}
    >
      {hero}

      {/* Form mode — single-column scrollable area */}
      {formZone != null && (
        <div
          style={{
            flex: '1 1 0',
            minHeight: 0,
            marginTop: '1cqi',
            paddingLeft: '8cqi',
            paddingRight: '8cqi',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
          }}
        >
          {formZone}
        </div>
      )}

      {/* Normal mode — smart grid */}
      {formZone == null && count > 0 && (
        <div
          style={{
            flex: '0 1 auto',
            minHeight: 0,
            marginTop: '1.5cqi',
            paddingLeft: '8cqi',
            paddingRight: '8cqi',
            width: '100%',
            display: 'grid',
            gridTemplateColumns: count === 1 ? '1fr' : '1fr 1fr',
            gap: '1.5cqi',
            alignContent: 'center',
            overflow: 'hidden',
          }}
        >
          {children.map((child, i) => {
            const spanFull = count > 1 && count % 2 === 1 && i === count - 1;
            return (
              <div
                key={i}
                style={{
                  gridColumn: spanFull ? '1 / -1' : undefined,
                  minHeight: 0,
                }}
              >
                {child}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
