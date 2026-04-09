import { useState, useEffect } from 'react';
import { X, Calendar } from 'lucide-react';
import type { AddToMealPlanModalProps } from './types';
import type { MealType } from '@/types';
import { getTodayLocal } from '@/utils/dateUtils';

const mealTypes: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
];

export function AddToMealPlanModal({
  isOpen,
  recipeName,
  initialServings,
  defaultServings = 4,
  onConfirm,
  onCancel,
}: AddToMealPlanModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocal());
  const [selectedMealType, setSelectedMealType] = useState<MealType>('dinner');
  // Use user's selected servings if provided, otherwise fall back to recipe default
  const [servings, setServings] = useState<number>(initialServings ?? defaultServings);

  // Sync servings when initialServings prop changes (fixes Issue #4)
  useEffect(() => {
    if (initialServings !== null && initialServings !== undefined) {
      setServings(initialServings);
    } else {
      setServings(defaultServings);
    }
  }, [initialServings, defaultServings]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(selectedDate, selectedMealType, servings);
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop - z-[100] to appear above ContextPanel (z-50) */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-slate-900 rounded-xl border border-slate-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-['Space_Grotesk'] text-lg font-semibold text-slate-100">
            Add to Meal Plan
          </h2>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-400">
            Add <span className="text-slate-200 font-medium">{recipeName}</span> to your meal plan
          </p>

          {/* Date picker */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="
                  w-full pl-10 pr-3 py-2.5 rounded-lg
                  bg-slate-800 border border-slate-700
                  text-slate-200
                  focus:outline-none focus:ring-2 focus:ring-cyan-500
                "
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {formatDate(selectedDate)}
            </p>
          </div>

          {/* Meal type selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Meal
            </label>
            <div className="flex gap-2">
              {mealTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setSelectedMealType(type.value)}
                  className={`
                    flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${selectedMealType === type.value
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
                    }
                  `}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Servings */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Servings
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={servings}
              onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
              className="
                w-24 px-3 py-2.5 rounded-lg
                bg-slate-800 border border-slate-700
                text-slate-200 text-center
                focus:outline-none focus:ring-2 focus:ring-cyan-500
              "
            />
            {initialServings && initialServings !== defaultServings && (
              <p className="mt-1 text-xs text-cyan-400/70">
                Using your scaled serving size
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-800">
          <button
            onClick={onCancel}
            className="
              flex-1 px-4 py-2.5 rounded-lg
              text-sm font-medium text-slate-300
              bg-slate-800 hover:bg-slate-700
              transition-colors
            "
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="
              flex-1 px-4 py-2.5 rounded-lg
              bg-cyan-500 hover:bg-cyan-400
              text-sm font-medium text-slate-900
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-cyan-500
            "
          >
            Add to Plan
          </button>
        </div>
      </div>
    </div>
  );
}
