/**
 * Carousel — Unified glass card carousel for all card types (main arc, sub-arc, junction).
 *
 * Unified carousel — merged from CardCarousel + JunctionCarousel.
 * Single rendering path for all card types with a `type` config prop.
 *
 * V9: Circular-only. Shield + card as sibling absolute divs.
 * Ring interior ~91% of radius. Card must fit INSIDE with clearance.
 */

import { Component, lazy, Suspense, useCallback, type ReactNode } from 'react';
import type { ArcPosition } from './utils/arcGeometry';
import { ARC_CONFIGS, getSubArcConfigs, JUNCTION_CONFIGS, getSubArcJunctionConfigs, junctionPosition, CENTER, type JunctionId } from './utils/arcGeometry';
import { getWidgetsForArc, getBezelSvgForArc } from './widgets';
import { getWidgetsForJunction, JUNCTION_CARD_COUNT, getSubArcWidgetsForJunction, getSubArcJunctionCardCount, type JunctionData } from './widgets/JunctionWidgets';
import { GlassCard } from './GlassCard';
import { JUNCTION_INSETS, useGlassStyle } from './cardTemplate';
import { useCarouselGestures } from './useCarouselGestures';
import { useAppStore } from '@/stores/appStore';

// ─── Error Boundary ──────────────────────────────────────────────────────────

/** Inline error boundary for sub-arc cards — shows error in-place instead of crashing */
class SubArcErrorBoundary extends Component<
  { children: ReactNode; arcLabel: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(`[SubArc ${this.props.arcLabel}] Render crash:`, error.message, info.componentStack);
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <div className="text-amber-400 text-xs font-mono mb-2">Card Error</div>
          {import.meta.env.DEV && (
            <div className="text-[10px] text-red-400 bg-slate-800/80 rounded p-2 max-h-32 overflow-y-auto w-full text-left font-mono break-all">
              {this.state.error.message}
            </div>
          )}
          <button
            className="mt-3 text-[10px] px-3 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Lazy Sub-Arc Cards ──────────────────────────────────────────────────────

const MonitorCard = lazy(() => import('./cards/MonitorCard').then((m) => ({ default: m.MonitorCard })));
const BudgetCard = lazy(() => import('./cards/BudgetCard').then((m) => ({ default: m.BudgetCard })));
const GoalsCard = lazy(() => import('./cards/GoalsCard').then((m) => ({ default: m.GoalsCard })));
const CapitalCard = lazy(() => import('./cards/CapitalCard').then((m) => ({ default: m.CapitalCard })));

const WeekSummaryCard = lazy(() => import('./cards/week/WeekSummaryCard').then((m) => ({ default: m.WeekSummaryCard })));
const WeekEventsCard = lazy(() => import('./cards/week/WeekEventsCard').then((m) => ({ default: m.WeekEventsCard })));
const WeekBillsCard = lazy(() => import('./cards/week/WeekBillsCard').then((m) => ({ default: m.WeekBillsCard })));
const WeekCalendarCard = lazy(() => import('./cards/week/WeekCalendarCard').then((m) => ({ default: m.WeekCalendarCard })));

const InventoryOverviewCard = lazy(() => import('./cards/inventory/InventoryOverviewCard').then((m) => ({ default: m.InventoryOverviewCard })));
const ExpiringCard = lazy(() => import('./cards/inventory/ExpiringCard').then((m) => ({ default: m.ExpiringCard })));
const FoodStatsCard = lazy(() => import('./cards/inventory/FoodStatsCard').then((m) => ({ default: m.FoodStatsCard })));
const ShoppingBridgeCard = lazy(() => import('./cards/inventory/ShoppingBridgeCard').then((m) => ({ default: m.ShoppingBridgeCard })));

const MealsOverviewCard = lazy(() => import('./cards/meals/MealsOverviewCard').then((m) => ({ default: m.MealsOverviewCard })));
const RecipesCard = lazy(() => import('./cards/meals/RecipesCard').then((m) => ({ default: m.RecipesCard })));
const CookingHistoryCard = lazy(() => import('./cards/meals/CookingHistoryCard').then((m) => ({ default: m.CookingHistoryCard })));
const UrlImportCard = lazy(() => import('./cards/meals/UrlImportCard').then((m) => ({ default: m.UrlImportCard })));

// ─── Click Propagation ───────────────────────────────────────────────────────

// Pre-computed junction positions in normalized [-1, 1] space.
// IMPORTANT: If a future sub-arc junction uses a NON-boundary angle, add its position here.
const JUNCTION_NORM = JUNCTION_CONFIGS.map((c) => {
  const pos = junctionPosition(c);
  return { nx: pos.x / CENTER - 1, ny: pos.y / CENTER - 1 };
});
const JUNCTION_HIT_R2 = 0.28 * 0.28;

function getClickNormalized(e: React.MouseEvent): { nx: number; ny: number; dist: number } | null {
  const container = (e.currentTarget as HTMLElement).parentElement?.parentElement;
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  return { nx, ny, dist: Math.sqrt(nx * nx + ny * ny) };
}

/** Check if a click event is near a junction — if so, let it propagate to the container.
 *  CRITICAL: Every onClick on shield/card divs MUST call this before stopPropagation(). */
function isClickNearJunction(e: React.MouseEvent): boolean {
  const pos = getClickNormalized(e);
  if (!pos) return false;
  for (const jp of JUNCTION_NORM) {
    const dx = pos.nx - jp.nx;
    const dy = pos.ny - jp.ny;
    if (dx * dx + dy * dy < JUNCTION_HIT_R2) return true;
  }
  return false;
}

/** Check if a click is in the arc ring zone — let it propagate for arc click handling.
 *  Threshold must match RadialDashboard.handleContainerClick arc detection (0.84). */
function isClickInArcRingZone(e: React.MouseEvent): boolean {
  const pos = getClickNormalized(e);
  if (!pos) return false;
  return pos.dist >= 0.84;
}

/** Standard click handler for shield/card divs — passes through junction and arc ring clicks */
function handleClickPropagation(e: React.MouseEvent) {
  if (!isClickNearJunction(e) && !isClickInArcRingZone(e)) e.stopPropagation();
}

/** Junction-specific click handler — passes through junction clicks but NOT arc ring clicks.
 *  Junction cards sit near edges where dist >= 0.84, so arc ring detection would hijack
 *  legitimate content clicks (buttons, inputs, checkboxes) inside junction cards. */
function handleJunctionClickPropagation(e: React.MouseEvent) {
  if (!isClickNearJunction(e)) e.stopPropagation();
}

/** Card content div — ALWAYS stops propagation. Card content clicks must never
 *  leak to the arc ring handler. Only the shield div uses arc ring zone detection. */
function stopClickPropagation(e: React.MouseEvent) {
  e.stopPropagation();
}

// ─── Section Metadata ────────────────────────────────────────────────────────

const SECTION_META: Record<ArcPosition, { label: string }> = {
  north: { label: 'WEEKVIEW' },
  east: { label: 'MEALS & RECIPES' },
  south: { label: 'FINANCIAL' },
  west: { label: 'INVENTORY' },
};

// Circular card & shield sizes as % insets from each edge of the container.
const CIRC_SHIELD_INSET = '9%';  // match card inset — shield covers card only, not extra space
const CIRC_CARD_INSET = '9%';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ArcCarouselProps {
  type: 'arc';
  arc: ArcPosition;
  activeIndex: number;
  onScrollCard: (delta: number, maxIndex: number) => void;
  reducedMotion: boolean;
  onCardEnter?: () => void;
  subArcMode?: ArcPosition | null;
}

interface JunctionCarouselProps {
  type: 'junction';
  junction: JunctionId;
  junctionData: JunctionData;
  activeIndex: number;
  onScrollCard: (delta: number, maxIndex: number) => void;
  reducedMotion: boolean;
  onCardEnter?: () => void;
  hideHeader?: boolean;
  subArcMode?: ArcPosition | null;
}

export type CarouselProps = ArcCarouselProps | JunctionCarouselProps;

// ─── Sub-Arc Renderer ────────────────────────────────────────────────────────

function SubArcContent({
  subArcMode,
  arc,
  arcColor,
  arcLabel,
  onCardEnter,
}: {
  subArcMode: ArcPosition;
  arc: ArcPosition;
  arcColor: string;
  arcLabel: string;
  onCardEnter?: () => void;
}) {
  const glass = useGlassStyle();

  return (
    <div className="absolute inset-0" style={{ zIndex: 20, pointerEvents: 'none' }}>
      <div
        className="absolute"
        style={{ inset: CIRC_SHIELD_INSET, pointerEvents: 'auto' }}
        onMouseEnter={onCardEnter}
        onClick={handleClickPropagation}
      />
      <div
        className="absolute overflow-hidden"
        style={{
          top: CIRC_CARD_INSET,
          bottom: CIRC_CARD_INSET,
          left: CIRC_CARD_INSET,
          right: CIRC_CARD_INSET,
          pointerEvents: 'auto',
          ...glass,
          borderRadius: '50%',
        }}
        onClick={handleClickPropagation}
      >
        <div className="relative w-full h-full overflow-hidden">
          {/* arcLabel removed from card face — bezel arc segments already show arc names.
              FUTURE: Add hover-show-all behavior where hovering sub-arc navigation shows all labels. */}
          <SubArcErrorBoundary arcLabel={arcLabel}>
            <Suspense fallback={<div className="flex items-center justify-center h-full"><span className="text-[10px] text-slate-500 animate-pulse">Loading...</span></div>}>
              {subArcMode === 'south' && arc === 'north' && <MonitorCard />}
              {subArcMode === 'south' && arc === 'east' && <BudgetCard />}
              {subArcMode === 'south' && arc === 'south' && <GoalsCard />}
              {subArcMode === 'south' && arc === 'west' && <CapitalCard />}
              {subArcMode === 'north' && arc === 'north' && <WeekSummaryCard />}
              {subArcMode === 'north' && arc === 'west' && <WeekEventsCard />}
              {subArcMode === 'north' && arc === 'east' && <WeekBillsCard />}
              {subArcMode === 'north' && arc === 'south' && <WeekCalendarCard />}
              {subArcMode === 'west' && arc === 'north' && <InventoryOverviewCard />}
              {subArcMode === 'west' && arc === 'east' && <ExpiringCard />}
              {subArcMode === 'west' && arc === 'south' && <FoodStatsCard />}
              {subArcMode === 'west' && arc === 'west' && <ShoppingBridgeCard />}
              {subArcMode === 'east' && arc === 'north' && <MealsOverviewCard />}
              {subArcMode === 'east' && arc === 'east' && <RecipesCard />}
              {subArcMode === 'east' && arc === 'south' && <CookingHistoryCard />}
              {subArcMode === 'east' && arc === 'west' && <UrlImportCard />}
            </Suspense>
          </SubArcErrorBoundary>
        </div>
      </div>
    </div>
  );
}

// ─── Main Arc Renderer ───────────────────────────────────────────────────────

function ArcContent({
  arc,
  activeIndex,
  reducedMotion,
  onCardEnter,
  handleWheel,
  handleTouchStart,
  handleTouchEnd,
}: ArcCarouselProps & ReturnType<typeof useCarouselGestures>) {
  // Subscribe so card config changes re-render arc content immediately
  useAppStore((s) => s.latticePrefs.arcCardConfig);
  const configSource = ARC_CONFIGS;
  const arcConfig = configSource.find((c) => c.position === arc);
  const arcColor = arcConfig?.color ?? '#22d3ee';
  const { widgets, labels } = getWidgetsForArc(arc);
  const bezelSvg = getBezelSvgForArc(arc, 400);

  const slideVariants = reducedMotion
    ? { initial: {}, animate: {}, exit: {} }
    : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 } };

  return (
    <div className="absolute inset-0" style={{ zIndex: 20, pointerEvents: 'none' }}>
      <div
        className="absolute"
        style={{ inset: CIRC_SHIELD_INSET, pointerEvents: 'auto' }}
        onMouseEnter={onCardEnter}
        onClick={handleClickPropagation}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      />
      <div
        className="absolute"
        style={{
          top: CIRC_CARD_INSET,
          bottom: CIRC_CARD_INSET,
          left: CIRC_CARD_INSET,
          right: CIRC_CARD_INSET,
          pointerEvents: 'auto',
        }}
        onClick={handleJunctionClickPropagation}
        onWheel={handleWheel}
      >
        <GlassCard
          label={SECTION_META[arc].label}
          color={arcColor}
          activeIndex={activeIndex}
          cardCount={widgets.length}
          labels={labels}
          widgets={widgets}
          slideVariants={slideVariants}
          reducedMotion={reducedMotion}
          bezelSvg={bezelSvg}
          hideHeader
        />
      </div>
    </div>
  );
}

// ─── Junction Renderer ───────────────────────────────────────────────────────

function JunctionContent({
  junction,
  junctionData,
  activeIndex,
  reducedMotion,
  onCardEnter,
  hideHeader,
  subArcMode,
  onScrollCard,
  handleWheel,
  handleTouchStart,
  handleTouchEnd,
}: JunctionCarouselProps & ReturnType<typeof useCarouselGestures>) {
  const allConfigs = subArcMode
    ? getSubArcJunctionConfigs(subArcMode)
    : JUNCTION_CONFIGS;
  const config = allConfigs.find((c) => c.id === junction);
  const color = config?.color ?? '#64748b';
  const label = config?.label ?? junction.toUpperCase();

  const staticCardCount = subArcMode
    ? getSubArcJunctionCardCount(subArcMode, junction)
    : JUNCTION_CARD_COUNT[junction];
  const maxIndexForNav = staticCardCount - 1;

  const navigateToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(0, Math.min(maxIndexForNav, page));
      const delta = clamped - activeIndex;
      if (delta !== 0) onScrollCard(delta, maxIndexForNav);
    },
    [activeIndex, maxIndexForNav, onScrollCard],
  );

  const { widgets, labels, bezelArcs, bezelSvg } = subArcMode
    ? getSubArcWidgetsForJunction(subArcMode, junction)
    : getWidgetsForJunction(junction, junctionData, navigateToPage);

  const slideVariants = reducedMotion
    ? { initial: {}, animate: {}, exit: {} }
    : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 } };

  const shieldInset = JUNCTION_INSETS.circ.shield;
  const cardInset = JUNCTION_INSETS.circ.card;

  return (
    <div className="absolute inset-0" style={{ zIndex: 20, pointerEvents: 'none' }}>
      <div
        className="absolute"
        style={{ inset: shieldInset, pointerEvents: 'auto' }}
        onMouseEnter={onCardEnter}
        onClick={handleJunctionClickPropagation}
        onWheel={junction === 'sw' ? undefined : handleWheel}
        onTouchStart={junction === 'sw' ? undefined : handleTouchStart}
        onTouchEnd={junction === 'sw' ? undefined : handleTouchEnd}
      />
      <div
        className="absolute"
        style={{
          top: cardInset,
          bottom: cardInset,
          left: cardInset,
          right: cardInset,
          pointerEvents: 'auto',
        }}
        onClick={handleJunctionClickPropagation}
        onWheel={junction === 'sw' ? undefined : handleWheel}
      >
        <GlassCard
          label={label}
          color={color}
          activeIndex={activeIndex}
          cardCount={widgets.length}
          labels={labels}
          widgets={widgets}
          slideVariants={slideVariants}
          reducedMotion={reducedMotion}
          bezelArcs={bezelArcs}
          bezelSvg={bezelSvg}
          hideHeader={hideHeader ?? true}
          arcNavConfig={junction === 'sw' ? { activeIndex, cardCount: widgets.length } : undefined}
          onArcNavigate={junction === 'sw' ? (dir) => navigateToPage(activeIndex + (dir === 'next' ? 1 : -1)) : undefined}
        />
      </div>
    </div>
  );
}

// ─── Unified Carousel ────────────────────────────────────────────────────────

export function Carousel(props: CarouselProps) {
  if (props.type === 'arc') {
    const { arc, subArcMode, onCardEnter } = props;

    // Sub-arc mode: single card, no carousel gestures needed
    if (subArcMode) {
      const configSource = getSubArcConfigs(subArcMode) ?? ARC_CONFIGS;
      const arcConfig = configSource.find((c) => c.position === arc);
      const arcColor = arcConfig?.color ?? '#22d3ee';
      const arcLabel = arcConfig?.label ?? arc.toUpperCase();
      return (
        <SubArcContent
          subArcMode={subArcMode}
          arc={arc}
          arcColor={arcColor}
          arcLabel={arcLabel}
          onCardEnter={onCardEnter}
        />
      );
    }

    // Main arc: carousel with gestures
    const { widgets } = getWidgetsForArc(arc);
    const maxIndex = widgets.length - 1;
    return <ArcCarouselWithGestures {...props} maxIndex={maxIndex} />;
  }

  // Junction carousel
  const { junction, subArcMode } = props;
  const staticCardCount = subArcMode
    ? getSubArcJunctionCardCount(subArcMode, junction)
    : JUNCTION_CARD_COUNT[junction];
  const maxIndex = staticCardCount - 1;
  return <JunctionCarouselWithGestures {...props} maxIndex={maxIndex} />;
}

/** Wrapper to call useCarouselGestures (hooks can't be conditional) */
function ArcCarouselWithGestures(props: ArcCarouselProps & { maxIndex: number }) {
  const gestures = useCarouselGestures({ onScrollCard: props.onScrollCard, maxIndex: props.maxIndex });
  return <ArcContent {...props} {...gestures} />;
}

function JunctionCarouselWithGestures(props: JunctionCarouselProps & { maxIndex: number }) {
  const gestures = useCarouselGestures({ onScrollCard: props.onScrollCard, maxIndex: props.maxIndex });
  return <JunctionContent {...props} {...gestures} />;
}
