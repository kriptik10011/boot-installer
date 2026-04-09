/**
 * InventoryLeftover — Add Leftover form
 *
 * Quick-select from recent meals with auto-expiration (4 days fridge, 90 days freezer).
 */

import { useState } from 'react';
import { useRecentMeals } from '@/hooks/useInventory';
import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import type { RecentMeal, LeftoverCreate } from '@/api/client';

export interface AddLeftoverFormProps {
  onSave: (data: LeftoverCreate) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}

export function AddLeftoverForm({ onSave, onCancel, isPending }: AddLeftoverFormProps) {
  const { data: recentMeals = [], isLoading } = useRecentMeals(7);
  const [selectedMeal, setSelectedMeal] = useState<RecentMeal | null>(null);
  const [form, setForm] = useState<Partial<LeftoverCreate>>({
    quantity: 1,
    unit: null,
    location: 'fridge',
    notes: null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeal) return;

    await onSave({
      meal_id: selectedMeal.id,
      quantity: form.quantity || 1,
      unit: form.unit || undefined,
      location: form.location || 'fridge',
      notes: form.notes || undefined,
    });
  };

  if (isLoading) {
    return <PanelSkeleton />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full p-6">
      <h3 className="text-lg font-semibold text-white mb-2">Save Leftover</h3>
      <p className="text-sm text-slate-400 mb-4">
        Select a recent meal to save as a leftover. Expiration is auto-set to 4 days (food safety standard).
      </p>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* Recent Meals Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">Select Meal *</label>
          {recentMeals.length === 0 ? (
            <div className="p-4 bg-slate-700/30 rounded-lg text-center text-slate-400">
              <p>No recent meals found.</p>
              <p className="text-sm mt-1">Add meals to your meal plan first.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recentMeals.map(meal => (
                <button
                  key={meal.id}
                  type="button"
                  onClick={() => setSelectedMeal(meal)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    selectedMeal?.id === meal.id
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <span className="text-lg">
                    {meal.meal_type === 'breakfast' ? '🍳' :
                     meal.meal_type === 'lunch' ? '🥗' : '🍽️'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {meal.recipe_name || meal.description || meal.meal_type}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(meal.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })} • {meal.meal_type}
                    </div>
                  </div>
                  {selectedMeal?.id === meal.id && (
                    <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Storage Location */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Storage Location</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'fridge' as const, label: 'Fridge (4 days)', icon: '❄️' },
              { value: 'freezer' as const, label: 'Freezer (90 days)', icon: '🧊' },
            ].map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, location: value })}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  form.location === value
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity and Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Portions</label>
            <input
              type="number"
              value={form.quantity || 1}
              onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })}
              min="1"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Container</label>
            <select
              value={form.unit || ''}
              onChange={(e) => setForm({ ...form, unit: e.target.value || null })}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">None</option>
              <option value="container">container</option>
              <option value="bowl">bowl</option>
              <option value="plate">plate</option>
              <option value="bag">bag</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Notes</label>
          <textarea
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
            rows={2}
            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
            placeholder="e.g., Half portion, needs to be eaten first..."
          />
        </div>

        {/* Expiration Info */}
        {selectedMeal && (
          <div className="p-3 bg-slate-700/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-amber-400">ℹ️</span>
              <span>
                Expiration will be auto-set to{' '}
                <strong className="text-white">
                  {form.location === 'freezer' ? '90 days' : '4 days'}
                </strong>
                {' '}from {new Date(selectedMeal.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' '}(food safety standard for{' '}
                {form.location === 'freezer' ? 'frozen' : 'refrigerated'} leftovers).
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6 pt-4 border-t border-slate-700">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || !selectedMeal}
          className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save Leftover'}
        </button>
      </div>
    </form>
  );
}
