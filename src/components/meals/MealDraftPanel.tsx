/**
 * MealDraftPanel — Shows 7-day x 3-meal grid of AI suggestions.
 *
 * Confidence badges, "Apply All" button. Drafts require explicit approval.
 */

import { useState, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { useMealDrafts, useApplyMealDrafts } from '@/hooks/usePredictions';
import { getTrustBorderClasses } from '@/utils/trustVisualization';
import type { DraftMealSuggestion } from '@/api/client';
import { getDayName } from '@/utils/dateUtils';

interface MealDraftPanelProps {
  onClose: () => void;
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;

export function MealDraftPanel({ onClose }: MealDraftPanelProps) {
  const { data, isLoading } = useMealDrafts();
  const applyDrafts = useApplyMealDrafts();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const suggestions = data?.suggestions ?? [];

  // Group suggestions by date
  const byDate = new Map<string, DraftMealSuggestion[]>();
  for (const s of suggestions) {
    const existing = byDate.get(s.date) ?? [];
    byDate.set(s.date, [...existing, s]);
  }

  const toggleSelection = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(suggestions.map((s) => `${s.date}-${s.meal_type}`)));
  }, [suggestions]);

  const handleApply = useCallback(() => {
    const toApply = suggestions.filter(
      (s) => selected.has(`${s.date}-${s.meal_type}`)
    );
    if (toApply.length === 0) return;
    applyDrafts.mutate(
      { suggestions: toApply },
      { onSuccess: () => onClose() }
    );
  }, [suggestions, selected, applyDrafts, onClose]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <Sparkles className="w-8 h-8 text-cyan-400 mx-auto mb-3 animate-pulse" />
          <p className="text-slate-300">Generating suggestions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Meal Draft Suggestions"
        className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Draft Week</h2>
            <span className="text-xs text-slate-500">
              {suggestions.length} suggestions
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {suggestions.length === 0 ? (
            <p className="text-center text-slate-500 py-8">
              No suggestions available. Add more recipes and meal history for better predictions.
            </p>
          ) : (
            <div className="space-y-4">
              {Array.from(byDate.entries()).map(([dateStr, daySuggestions]) => (
                <div key={dateStr} className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-400">
                    {getDayName(dateStr, 'long')} - {dateStr}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {MEAL_TYPES.map((type) => {
                      const s = daySuggestions.find((d) => d.meal_type === type);
                      if (!s) return <div key={type} className="p-3 rounded-lg bg-slate-700/20 text-center text-xs text-slate-600">-</div>;

                      const key = `${s.date}-${s.meal_type}`;
                      const isSelected = selected.has(key);

                      const trustBorder = getTrustBorderClasses(s.confidence, 'border-slate-600/50');

                      return (
                        <button
                          key={type}
                          onClick={() => toggleSelection(key)}
                          className={`p-3 rounded-lg text-left transition-all ${
                            isSelected
                              ? 'bg-cyan-500/20 border border-cyan-500/30'
                              : `bg-slate-700/30 ${trustBorder} hover:border-slate-600`
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] uppercase text-slate-500">{type}</span>
                            <ConfidenceBadge confidence={s.confidence} />
                          </div>
                          <p className="text-sm font-medium text-slate-200 truncate">
                            {s.recipe_name || s.description || 'Suggestion'}
                          </p>
                          {s.reason && (
                            <p className="text-[10px] text-slate-500 mt-1 truncate">{s.reason}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
          <span className="text-sm text-slate-500">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={selected.size === 0 || applyDrafts.isPending}
              className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold rounded-lg
                         text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {applyDrafts.isPending ? 'Applying...' : `Apply ${selected.size} Meals`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 70 ? 'text-emerald-400 bg-emerald-500/20' :
    pct >= 50 ? 'text-cyan-400 bg-cyan-500/20' :
    'text-amber-400 bg-amber-500/20';

  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${color}`}>
      {pct}%
    </span>
  );
}
