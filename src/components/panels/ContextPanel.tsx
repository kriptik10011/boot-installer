/**
 * ContextPanel Component
 *
 * Base contextual panel that slides in from the right (overlay mode)
 * or renders inline below the day grid (inline mode for Traditional view).
 * Renders the appropriate panel content based on type.
 * Supports expand-to-fullscreen for "at the store" mode.
 * Supports drag-to-resize width in overlay mode.
 */

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { EventPanel } from './EventPanel';
import { MealPanel } from './MealPanel';
import { BillPanel } from './BillPanel';
import { ShoppingPanel } from './ShoppingPanel';
import { SettingsPanel } from './SettingsPanel';
import { InventoryPanel } from './InventoryPanel';
import { RecipePanel } from './RecipePanel';
import { FinancePanel } from './FinancePanel';
import { FinancialImportPanel } from '../finance/FinancialImportPanel';
import { WeeklyReviewPanelContent } from '../week/WeeklyReviewWizard';
import { useAppStore } from '@/stores/appStore';
import type { ContextPanelProps } from './types';

/* ── Resize hook ─────────────────────────────────── */

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_RATIO = 0.85;

function useResizablePanel() {
  const storedWidth = useAppStore((s) => s.contextPanelWidth);
  const setStoredWidth = useAppStore((s) => s.setContextPanelWidth);
  const [panelWidth, setPanelWidth] = useState(storedWidth);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    let lastWidth = 0;
    const onMouseMove = (ev: MouseEvent) => {
      const w = window.innerWidth - ev.clientX;
      const clamped = Math.max(MIN_PANEL_WIDTH, Math.min(w, window.innerWidth * MAX_PANEL_RATIO));
      lastWidth = clamped;
      setPanelWidth(clamped);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      if (lastWidth > 0) setStoredWidth(lastWidth);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [setStoredWidth]);

  return { panelWidth, isDragging, handleMouseDown };
}

/* ── ContextPanel ───────────────────────────────── */

export const ContextPanel = forwardRef<HTMLDivElement, ContextPanelProps>(function ContextPanel({
  type,
  itemId,
  date,
  mealType,
  isOccurrence,
  occurrenceDate,
  isFullscreen,
  inlineMode,
  onClose,
  onToggleFullscreen,
  onEnterCookingMode,
}, ref) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { currentWeekStart } = useAppStore();
  const { panelWidth, isDragging, handleMouseDown } = useResizablePanel();

  // Handle escape key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        onClose();
      }
    };

    if (type) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [type, onClose]);

  // Handle click outside to close (overlay mode only)
  useEffect(() => {
    if (inlineMode) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        !isFullscreen &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        // Don't close if a full-screen overlay is active (ShaderLab, Leva portal)
        if (document.querySelector('[data-overlay-active]')) return;
        onClose();
      }
    };

    if (type) {
      // Delay adding listener to avoid immediate close
      const timeout = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timeout);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [type, isFullscreen, inlineMode, onClose]);

  const financeViewMode = useAppStore((s) => s.financeViewMode);

  if (!type) return null;

  // Radial finance mode: bypass panel wrapper entirely — RadialDashboard is fullscreen
  if (type === 'finance' && financeViewMode === 'radial') {
    return <FinancePanel onClose={onClose} />;
  }

  // Panel title based on type
  const getTitle = () => {
    switch (type) {
      case 'event':
        return itemId ? 'Event Details' : 'New Event';
      case 'meal':
        return itemId ? 'Meal Details' : 'Plan Meal';
      case 'bill':
        return itemId ? 'Bill Details' : 'New Bill';
      case 'shopping':
        return 'Shopping List';
      case 'settings':
        return 'Settings';
      case 'inventory':
        return 'Food Inventory';
      case 'import':
        return 'Import Financial Data';
      case 'recipes':
        return 'Recipe Hub';
      case 'finance':
        return 'Finance';
      case 'review':
        return 'Weekly Review';
      default:
        return '';
    }
  };

  // Render appropriate panel content
  const renderContent = () => {
    switch (type) {
      case 'event':
        return <EventPanel eventId={itemId} date={date} isOccurrence={isOccurrence} occurrenceDate={occurrenceDate} onClose={onClose} />;
      case 'meal':
        return <MealPanel mealId={itemId} date={date} mealType={mealType} onClose={onClose} onEnterCookingMode={onEnterCookingMode} />;
      case 'bill':
        return <BillPanel billId={itemId} date={date} onClose={onClose} />;
      case 'shopping':
        return (
          <ShoppingPanel
            weekStart={currentWeekStart}
            onClose={onClose}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
        );
      case 'settings':
        return <SettingsPanel onClose={onClose} />;
      case 'inventory':
        return <InventoryPanel onClose={onClose} />;
      case 'import':
        return <FinancialImportPanel onClose={onClose} onSuccess={onClose} />;
      case 'recipes':
        return <RecipePanel onClose={onClose} initialRecipeId={itemId || undefined} />;
      case 'finance':
        return <FinancePanel onClose={onClose} />;
      case 'review':
        return <WeeklyReviewPanelContent onClose={onClose} />;
      default:
        return null;
    }
  };

  // Header shared between inline and overlay modes
  const header = (
    <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
      <h2 className="text-lg font-semibold text-white">{getTitle()}</h2>
      <div className="flex items-center gap-2">
        {/* Expand/Collapse button (for shopping list and finance) */}
        {(type === 'shopping' || type === 'finance') && (
          <button
            onClick={onToggleFullscreen}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          aria-label="Close panel"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </header>
  );

  // Inline mode: render in document flow below the grid
  if (inlineMode && !isFullscreen) {
    return (
      <div
        ref={ref}
        className="mt-6 mx-6 rounded-xl border border-slate-700/50 bg-slate-800/95 shadow-2xl flex flex-col"
      >
        {header}
        <div className="flex-1 overflow-y-auto max-h-[70vh]">
          {renderContent()}
        </div>
      </div>
    );
  }

  // Overlay mode: fixed position slide-in from right
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-200 ${
          type ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full bg-slate-800 border-l border-slate-700 shadow-2xl z-50 flex flex-col transform transition-transform duration-200 ${
          type ? 'translate-x-0' : 'translate-x-full'
        } ${isFullscreen ? 'w-full' : ''}`}
        style={isFullscreen ? undefined : { width: `${panelWidth}px` }}
      >
        {/* Drag handle — left edge */}
        {!isFullscreen && (
          <div
            onMouseDown={handleMouseDown}
            className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 transition-colors ${
              isDragging ? 'bg-cyan-500/50' : 'hover:bg-cyan-500/30'
            }`}
          />
        )}

        {header}

        {/* Panel Content — container query for cqi scaling */}
        <div className="flex-1 overflow-y-auto" style={{ containerType: 'inline-size' }}>
          {renderContent()}
        </div>
      </div>
    </>
  );
});
