/**
 * IngredientCoverageList — Ingredient list with inventory stock status.
 *
 * Shared between rectangular and circular UrlImportCard edit modes.
 * Maps parsed ingredients to coverage data, shows stock indicators
 * and alternative suggestions for missing items.
 */

import type { ExtractedIngredient, CoverageCheckResponse } from '@/api';

interface IngredientCoverageListProps {
  ingredients: ExtractedIngredient[];
  coverage: CoverageCheckResponse | undefined;
  isLoading: boolean;
  onEdit?: (index: number, field: 'name' | 'quantity' | 'unit', value: string) => void;
  onRemove?: (index: number) => void;
  compact?: boolean;
}

export function IngredientCoverageList({
  ingredients,
  coverage,
  isLoading,
  onEdit,
  onRemove,
  compact = false,
}: IngredientCoverageListProps) {
  // Build lookup: ingredient name → coverage status
  const statusMap = new Map(
    coverage?.ingredients.map((s) => [s.name.toLowerCase().trim(), s]) ?? [],
  );

  if (ingredients.length === 0) {
    return <div className="text-xs text-slate-500 italic">No ingredients extracted</div>;
  }

  return (
    <div className={`space-y-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>
      {ingredients.map((ing, idx) => {
        const status = statusMap.get(ing.name.toLowerCase().trim());
        const inStock = status?.in_stock ?? false;
        const dotColor = isLoading
          ? 'bg-slate-500'
          : inStock
            ? 'bg-emerald-400'
            : 'bg-amber-400';

        if (compact) {
          // View-only compact mode for circular card
          return (
            <div key={idx} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
              <span className="text-slate-300 truncate">
                {ing.quantity && `${ing.quantity} `}
                {ing.unit && `${ing.unit} `}
                {ing.name}
              </span>
              {!inStock && status?.alternatives.length ? (
                <span className="text-amber-400/70 truncate ml-auto">
                  try: {status.alternatives[0]}
                </span>
              ) : null}
            </div>
          );
        }

        // Editable mode for rectangular card
        return (
          <div key={idx} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
            <input
              type="text"
              placeholder="Qty"
              value={ing.quantity || ''}
              onChange={(e) => onEdit?.(idx, 'quantity', e.target.value)}
              className="w-12 px-1.5 py-1 bg-slate-800/80 border border-white/10 rounded text-slate-200 focus:outline-none focus:border-emerald-500/40"
            />
            <input
              type="text"
              placeholder="Unit"
              value={ing.unit || ''}
              onChange={(e) => onEdit?.(idx, 'unit', e.target.value)}
              className="w-14 px-1.5 py-1 bg-slate-800/80 border border-white/10 rounded text-slate-200 focus:outline-none focus:border-emerald-500/40"
            />
            <input
              type="text"
              placeholder="Ingredient"
              value={ing.name}
              onChange={(e) => onEdit?.(idx, 'name', e.target.value)}
              className="flex-1 px-1.5 py-1 bg-slate-800/80 border border-white/10 rounded text-slate-200 focus:outline-none focus:border-emerald-500/40"
            />
            {!inStock && status?.alternatives.length ? (
              <span className="text-amber-400/70 text-[10px] whitespace-nowrap">
                try: {status.alternatives[0]}
              </span>
            ) : status?.stock_note ? (
              <span className="text-emerald-400/60 text-[10px] whitespace-nowrap">
                {status.stock_note}
              </span>
            ) : null}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="p-0.5 text-slate-500 hover:text-amber-400 flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
