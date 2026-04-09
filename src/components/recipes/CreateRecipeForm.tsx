import type { RecipeCreate, RecipeCategory } from '@/types';
import { CUISINE_TYPES } from '@/constants/cuisines';

export interface CreateRecipeFormProps {
  formData: RecipeCreate;
  categories: RecipeCategory[];
  onChange: (data: RecipeCreate) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
}

export function CreateRecipeForm({
  formData,
  categories,
  onChange,
  onSubmit,
  isSubmitting,
  submitLabel = 'Create Recipe',
}: CreateRecipeFormProps) {
  const updateField = <K extends keyof RecipeCreate>(key: K, value: RecipeCreate[K]) => {
    onChange({ ...formData, [key]: value });
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Recipe Name <span className="text-amber-400">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => updateField('name', e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          placeholder="e.g., Overnight Oats"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Category</label>
        <select
          value={formData.category_id ?? ''}
          onChange={(e) => updateField('category_id', e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
        >
          <option value="">No Category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Cuisine Type</label>
        <select
          value={formData.cuisine_type ?? ''}
          onChange={(e) => updateField('cuisine_type', e.target.value || null)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
        >
          <option value="">Select cuisine...</option>
          {CUISINE_TYPES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Prep Time</label>
          <input
            type="number"
            min="0"
            value={formData.prep_time_minutes ?? ''}
            onChange={(e) => updateField('prep_time_minutes', e.target.value ? parseInt(e.target.value) : null)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            placeholder="min"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Cook Time</label>
          <input
            type="number"
            min="0"
            value={formData.cook_time_minutes ?? ''}
            onChange={(e) => updateField('cook_time_minutes', e.target.value ? parseInt(e.target.value) : null)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            placeholder="min"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Servings</label>
          <input
            type="number"
            min="1"
            value={formData.servings ?? ''}
            onChange={(e) => updateField('servings', e.target.value ? parseInt(e.target.value) : null)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            placeholder="4"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Ingredients
        </label>
        <textarea
          value={formData.notes?.startsWith('INGREDIENTS:\n')
            ? formData.notes.split('\n\nNOTES:\n')[0].replace('INGREDIENTS:\n', '')
            : ''}
          onChange={(e) => {
            const currentNotes = formData.notes || '';
            const existingNotes = currentNotes.includes('\n\nNOTES:\n')
              ? currentNotes.split('\n\nNOTES:\n')[1]
              : (currentNotes.startsWith('INGREDIENTS:\n') ? '' : currentNotes);
            const newIngredients = e.target.value;
            if (newIngredients.trim() && existingNotes.trim()) {
              updateField('notes', `INGREDIENTS:\n${newIngredients}\n\nNOTES:\n${existingNotes}`);
            } else if (newIngredients.trim()) {
              updateField('notes', `INGREDIENTS:\n${newIngredients}`);
            } else if (existingNotes.trim()) {
              updateField('notes', existingNotes);
            } else {
              updateField('notes', null);
            }
          }}
          rows={4}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none font-mono text-sm"
          placeholder="2 cups flour&#10;1 tsp salt&#10;3 eggs&#10;1 cup milk"
        />
        <p className="mt-1 text-xs text-slate-500">
          One ingredient per line. For URL imports, ingredients are extracted automatically.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Instructions <span className="text-amber-400">*</span>
        </label>
        <textarea
          value={formData.instructions}
          onChange={(e) => updateField('instructions', e.target.value)}
          rows={8}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none font-mono text-sm"
          placeholder="1. First step&#10;2. Second step&#10;3. Third step"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Source</label>
        <input
          type="text"
          value={formData.source ?? ''}
          onChange={(e) => updateField('source', e.target.value || null)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          placeholder="URL or cookbook name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
        <textarea
          value={(() => {
            const notes = formData.notes || '';
            if (notes.includes('\n\nNOTES:\n')) {
              return notes.split('\n\nNOTES:\n')[1];
            }
            if (notes.startsWith('INGREDIENTS:\n')) {
              return '';
            }
            return notes;
          })()}
          onChange={(e) => {
            const currentNotes = formData.notes || '';
            const existingIngredients = currentNotes.startsWith('INGREDIENTS:\n')
              ? currentNotes.split('\n\nNOTES:\n')[0]
              : '';
            const newNotesText = e.target.value;
            if (existingIngredients && newNotesText.trim()) {
              updateField('notes', `${existingIngredients}\n\nNOTES:\n${newNotesText}`);
            } else if (existingIngredients) {
              updateField('notes', existingIngredients);
            } else {
              updateField('notes', newNotesText || null);
            }
          }}
          rows={3}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
          placeholder="Tips, variations, etc."
        />
      </div>

      <div className="flex justify-end pt-4 border-t border-slate-700">
        <button
          onClick={onSubmit}
          disabled={!formData.name.trim() || !formData.instructions.trim() || isSubmitting}
          className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </div>
  );
}
