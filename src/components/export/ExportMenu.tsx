/**
 * ExportMenu — Dropdown with 3 export targets.
 *
 * Renders off-screen print components and triggers PDF export.
 * Controlled by useExport hook.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Printer } from 'lucide-react';
import { MealPlanPrint } from './MealPlanPrint';
import { ShoppingListPrint } from './ShoppingListPrint';
import { FinancialSummaryPrint } from './FinancialSummaryPrint';
import { useExport, useExportData, type ExportTarget } from '@/hooks/useExport';
import { useShoppingListWeek } from '@/hooks/useShoppingList';

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { exporting, isExporting, exportFromElement } = useExport();
  const { weekStart, meals, recipes, bills, income } = useExportData();
  const { data: shoppingItems = [] } = useShoppingListWeek(weekStart);

  // Print target refs
  const mealPrintRef = useRef<HTMLDivElement>(null);
  const shoppingPrintRef = useRef<HTMLDivElement>(null);
  const financePrintRef = useRef<HTMLDivElement>(null);

  // Export target that was clicked — triggers render then export
  const [pendingTarget, setPendingTarget] = useState<ExportTarget | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Once pending target is set and ref is mounted, trigger export
  useEffect(() => {
    if (!pendingTarget) return;

    const refMap: Record<ExportTarget, React.RefObject<HTMLDivElement | null>> = {
      'meal-plan': mealPrintRef,
      'shopping-list': shoppingPrintRef,
      'financial-summary': financePrintRef,
    };

    const el = refMap[pendingTarget].current;
    if (el) {
      exportFromElement(pendingTarget, el).then(() => {
        setPendingTarget(null);
      });
    }
  }, [pendingTarget, exportFromElement]);

  const handleExport = useCallback((target: ExportTarget) => {
    setOpen(false);
    setPendingTarget(target);
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isExporting}
        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Export"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {isExporting ? (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <Printer className="w-5 h-5" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1"
        >
          <MenuItem
            label="Export Meal Plan"
            description="7-day meal grid as PDF"
            onClick={() => handleExport('meal-plan')}
          />
          <MenuItem
            label="Export Shopping List"
            description="Checkboxes by category"
            onClick={() => handleExport('shopping-list')}
          />
          <MenuItem
            label="Export Financial Summary"
            description="Bills, income, totals"
            onClick={() => handleExport('financial-summary')}
          />
        </div>
      )}

      {/* Off-screen print targets */}
      <div className="fixed left-[-9999px] top-0" aria-hidden="true">
        {pendingTarget === 'meal-plan' && (
          <MealPlanPrint
            ref={mealPrintRef}
            weekStart={weekStart}
            meals={meals}
            recipes={recipes}
          />
        )}
        {pendingTarget === 'shopping-list' && (
          <ShoppingListPrint
            ref={shoppingPrintRef}
            weekStart={weekStart}
            items={shoppingItems}
          />
        )}
        {pendingTarget === 'financial-summary' && (
          <FinancialSummaryPrint
            ref={financePrintRef}
            weekStart={weekStart}
            bills={bills}
            income={income}
          />
        )}
      </div>
    </div>
  );
}

function MenuItem({
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="w-full text-left px-4 py-2 hover:bg-slate-700/50 transition-colors"
    >
      <div className="text-sm text-slate-200">{label}</div>
      <div className="text-xs text-slate-500">{description}</div>
    </button>
  );
}
