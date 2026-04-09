/**
 * RadialGlassCard — Glassmorphic card wrapper with 3D glass layering effect.
 *
 * Features:
 * - CSS perspective + translateZ on hover for depth
 * - Focus mode: dimmed when another card is focused
 * - Privacy blur: blurs children when privacy mode is active
 * - Click to focus (spotlight mode)
 * - Anomaly pulse ring when card has anomalous data
 */

import { useRef, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';

interface RadialGlassCardProps {
  children: ReactNode;
  accentColor?: string;
  colSpan?: number;
  className?: string;
  cardId?: string;
  hasAnomaly?: boolean;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

export function RadialGlassCard({
  children,
  accentColor = '#22d3ee',
  colSpan = 1,
  className = '',
  cardId,
  hasAnomaly = false,
  isBlurred = false,
  opacity = 1,
  scale = 1,
  onFocus,
}: RadialGlassCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(800px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg) scale(${scale}) translateZ(8px)`;
  }

  function handleMouseLeave() {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = `perspective(800px) rotateY(0deg) rotateX(0deg) scale(${scale}) translateZ(0px)`;
  }

  function handleClick() {
    if (cardId && onFocus) {
      onFocus(cardId);
    }
  }

  return (
    <div
      ref={cardRef}
      data-card-id={cardId}
      className={`rounded-2xl p-5 relative ${className}`}
      style={{
        gridColumn: colSpan > 1 ? `span ${colSpan}` : undefined,
        background: 'rgba(8, 16, 32, 0.85)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${accentColor}26`,
        boxShadow: `0 4px 24px rgba(0, 0, 0, 0.3), 0 0 8px ${accentColor}0D`,
        opacity,
        transform: `perspective(800px) scale(${scale})`,
        transition: 'opacity 300ms ease, transform 300ms ease, box-shadow 200ms ease',
        cursor: onFocus ? 'pointer' : 'default',
        transformStyle: 'preserve-3d',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Anomaly pulse ring */}
      {hasAnomaly && (
        <div
          className="absolute -inset-[2px] rounded-2xl pointer-events-none"
          style={{
            border: `2px solid ${accentColor}`,
            animation: 'anomalyPulse 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Privacy blur overlay */}
      {isBlurred && (
        <div
          className="absolute inset-0 rounded-2xl z-10 flex items-center justify-center"
          style={{
            backdropFilter: 'blur(12px)',
            background: 'rgba(8, 16, 32, 0.3)',
          }}
        >
          <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        </div>
      )}

      {children}
    </div>
  );
}
