/**
 * WheelPicker — iOS-style scrolling column picker.
 * Each column scrolls independently via pointer drag, mouse wheel, or touch.
 * Momentum + snap-to-item physics. 3-row visible window with fade mask.
 * No container border — parent provides boundary.
 * Pure props + internal refs for 60fps animation. cqi-responsive.
 */

import { useRef, useCallback, useEffect, type ReactNode } from 'react';
import { BUTTON_MIN_TEXT, FONT_FAMILY } from '../cardTemplate';

export interface WheelColumn {
  values: readonly string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  /** Column width weight (default 1) */
  flex?: number;
}

interface WheelPickerProps {
  columns: readonly WheelColumn[];
  accentColor?: string;
  className?: string;
}

const ITEM_HEIGHT = 2.8; // cqi per item row
const VISIBLE_ROWS = 3;
const PICKER_HEIGHT = `${ITEM_HEIGHT * VISIBLE_ROWS}cqi`;
const DRAG_THRESHOLD = 8; // px before drag activates
const WHEEL_COOLDOWN = 120; // ms between wheel ticks
const FRICTION = 0.85;
const VELOCITY_THRESHOLD = 0.3;
const MAX_MOMENTUM_FRAMES = 60;

export function WheelPicker({ columns, accentColor = '#94a3b8', className }: WheelPickerProps) {
  return (
    <div
      className={`flex items-stretch ${className ?? ''}`}
      style={{
        height: PICKER_HEIGHT,
        gap: 0,
        position: 'relative',
        fontFamily: FONT_FAMILY,
        userSelect: 'none',
      }}
    >
      {columns.map((col, i) => (
        <ColumnWheel
          key={i}
          column={col}
          accentColor={accentColor}
          showDivider={i < columns.length - 1}
        />
      ))}
      {/* Selection indicator — fixed center band */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${ITEM_HEIGHT}cqi`,
          height: `${ITEM_HEIGHT}cqi`,
          borderTop: `1px solid ${accentColor}25`,
          borderBottom: `1px solid ${accentColor}25`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function ColumnWheel({
  column,
  accentColor,
  showDivider,
}: {
  column: WheelColumn;
  accentColor: string;
  showDivider: boolean;
}) {
  const { values, selectedIndex, onChange } = column;
  const len = values.length;

  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    isDragging: false,
    startY: 0,
    startIndex: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
    hasMoved: false,
  });
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafId = useRef<number>(0);

  // Cleanup RAF on unmount
  useEffect(() => () => { cancelAnimationFrame(rafId.current); }, []);

  const wrap = useCallback((idx: number) => ((idx % len) + len) % len, [len]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    cancelAnimationFrame(rafId.current);
    const el = containerRef.current;
    if (el) el.setPointerCapture(e.pointerId);
    dragState.current = {
      isDragging: true,
      startY: e.clientY,
      startIndex: selectedIndex,
      lastY: e.clientY,
      lastTime: Date.now(),
      velocity: 0,
      hasMoved: false,
    };
  }, [selectedIndex]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds.isDragging) return;
    e.stopPropagation();

    const dy = e.clientY - ds.startY;
    if (!ds.hasMoved && Math.abs(dy) < DRAG_THRESHOLD) return;
    ds.hasMoved = true;

    // Track velocity
    const now = Date.now();
    const dt = now - ds.lastTime;
    if (dt > 0) {
      const v = (e.clientY - ds.lastY) / dt;
      ds.velocity = 0.8 * v + 0.2 * ds.velocity;
    }
    ds.lastY = e.clientY;
    ds.lastTime = now;

    // Convert px delta to index offset (negative dy = scroll up = next item)
    const el = containerRef.current;
    if (!el) return;
    const itemPx = el.clientHeight / VISIBLE_ROWS;
    const indexDelta = Math.round(-dy / itemPx);
    const newIndex = wrap(ds.startIndex + indexDelta);
    if (newIndex !== selectedIndex) onChange(newIndex);
  }, [selectedIndex, onChange, wrap]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds.isDragging) return;
    ds.isDragging = false;
    e.stopPropagation();

    const el = containerRef.current;
    if (el) el.releasePointerCapture(e.pointerId);

    // Momentum if velocity is significant
    const vel = ds.velocity;
    if (Math.abs(vel) > VELOCITY_THRESHOLD && el) {
      const itemPx = el.clientHeight / VISIBLE_ROWS;
      let momentum = vel * 200; // scale velocity to distance
      let currentIdx = selectedIndex;
      let frame = 0;

      const animate = () => {
        momentum *= FRICTION;
        frame++;
        if (Math.abs(momentum) < 0.5 || frame > MAX_MOMENTUM_FRAMES) return;

        const steps = Math.round(-momentum / itemPx);
        if (steps !== 0) {
          currentIdx = wrap(currentIdx + steps);
          onChange(currentIdx);
          momentum -= steps * -itemPx;
        }
        rafId.current = requestAnimationFrame(animate);
      };
      rafId.current = requestAnimationFrame(animate);
    }
  }, [selectedIndex, onChange, wrap]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (wheelTimer.current) return;

    const delta = e.deltaY > 0 ? 1 : -1;
    onChange(wrap(selectedIndex + delta));

    wheelTimer.current = setTimeout(() => { wheelTimer.current = null; }, WHEEL_COOLDOWN);
  }, [selectedIndex, onChange, wrap]);

  // Render 3 visible items: previous, current, next
  const prevIdx = wrap(selectedIndex - 1);
  const nextIdx = wrap(selectedIndex + 1);

  const itemStyle = (isSelected: boolean): React.CSSProperties => ({
    height: `${ITEM_HEIGHT}cqi`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `${BUTTON_MIN_TEXT}cqi`,
    color: isSelected ? '#e2e8f0' : '#64748b',
    opacity: isSelected ? 1 : 0.35,
    fontWeight: isSelected ? 600 : 400,
    transition: 'opacity 0.15s, color 0.15s',
    pointerEvents: 'none',
  });

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      style={{
        flex: column.flex ?? 1,
        overflow: 'hidden',
        cursor: 'ns-resize',
        touchAction: 'none',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        borderRight: showDivider ? `1px solid ${accentColor}15` : undefined,
      }}
    >
      <div style={itemStyle(false)}>{values[prevIdx]}</div>
      <div style={itemStyle(true)}>{values[selectedIndex]}</div>
      <div style={itemStyle(false)}>{values[nextIdx]}</div>
    </div>
  );
}
