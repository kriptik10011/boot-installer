/**
 * useExport — Export meal plans, shopping lists, and financial summaries.
 *
 * Renders print components off-screen, then exports via html2canvas + jsPDF.
 * Returns loading state + toast feedback.
 */

import { useState, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useWeekMeals } from './useMeals';
import { useRecipes } from './useRecipes';
import { useFinancialItems } from './useFinances';
import { useUnifiedBills } from './useUnifiedBills';
import { useToastStore } from '@/stores/toastStore';
import { exportToPDF } from '@/utils/pdfExport';

export type ExportTarget = 'meal-plan' | 'shopping-list' | 'financial-summary';

export function useExport() {
  const [exporting, setExporting] = useState<ExportTarget | null>(null);
  const weekStart = useAppStore((s) => s.currentWeekStart);
  const addToast = useToastStore((s) => s.addToast);

  const isExporting = exporting !== null;

  const exportFromElement = useCallback(
    async (target: ExportTarget, element: HTMLElement | null) => {
      if (!element) {
        addToast({ type: 'error', message: 'Export failed: no content to render', durationMs: 4000 });
        return;
      }

      setExporting(target);
      try {
        const filenames: Record<ExportTarget, string> = {
          'meal-plan': `meal-plan-${weekStart}.pdf`,
          'shopping-list': `shopping-list-${weekStart}.pdf`,
          'financial-summary': `financial-summary-${weekStart}.pdf`,
        };

        await exportToPDF(element, {
          filename: filenames[target],
          orientation: target === 'meal-plan' ? 'landscape' : 'portrait',
        });

        addToast({ type: 'success', message: `${getLabel(target)} exported as PDF`, durationMs: 4000 });
      } catch (error) {
        addToast({ type: 'error', message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, durationMs: 4000 });
      } finally {
        setExporting(null);
      }
    },
    [weekStart, addToast]
  );

  return {
    weekStart,
    exporting,
    isExporting,
    exportFromElement,
  };
}

function getLabel(target: ExportTarget): string {
  switch (target) {
    case 'meal-plan': return 'Meal plan';
    case 'shopping-list': return 'Shopping list';
    case 'financial-summary': return 'Financial summary';
  }
}

/**
 * Data hooks for export components.
 * Separated so print components can be rendered with data.
 */
export function useExportData() {
  const weekStart = useAppStore((s) => s.currentWeekStart);
  const { data: meals = [] } = useWeekMeals(weekStart);
  const { data: recipes = [] } = useRecipes();
  const { bills: unifiedBills } = useUnifiedBills({ days: 90 });
  const { data: income = [] } = useFinancialItems('income');

  return { weekStart, meals, recipes, bills: unifiedBills, income };
}
