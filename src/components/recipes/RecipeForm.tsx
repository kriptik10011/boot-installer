import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { RecipeImportForm } from './RecipeImportForm';
import { RecipeImportPreview } from './RecipeImportPreview';
import type { RecipeFormProps } from './types';
import type { RecipeCreate } from '@/types';
import type { ExtractedRecipe } from '@/api/client';

type TabType = 'manual' | 'import';
type ImportStep = 'url' | 'preview';

export function RecipeForm({
  recipe,
  categories,
  isOpen,
  onClose,
  onSave,
}: RecipeFormProps) {
  const isEditMode = !!recipe;
  const [activeTab, setActiveTab] = useState<TabType>('manual');
  const [importStep, setImportStep] = useState<ImportStep>('url');
  const [extractedRecipe, setExtractedRecipe] = useState<ExtractedRecipe | null>(null);

  const [formData, setFormData] = useState<RecipeCreate>({
    name: '',
    category_id: null,
    instructions: '',
    prep_time_minutes: null,
    cook_time_minutes: null,
    servings: null,
    source: null,
    notes: null,
  });

  const [errors, setErrors] = useState<{ name?: string; instructions?: string }>({});

  // Reset form when opening/closing or when recipe changes
  useEffect(() => {
    if (isOpen && recipe) {
      setFormData({
        name: recipe.name,
        category_id: recipe.category_id,
        instructions: recipe.instructions,
        prep_time_minutes: recipe.prep_time_minutes,
        cook_time_minutes: recipe.cook_time_minutes,
        servings: recipe.servings,
        source: recipe.source,
        notes: recipe.notes,
      });
      setActiveTab('manual'); // Edit mode always uses manual
    } else if (isOpen) {
      setFormData({
        name: '',
        category_id: null,
        instructions: '',
        prep_time_minutes: null,
        cook_time_minutes: null,
        servings: null,
        source: null,
        notes: null,
      });
      setActiveTab('manual');
      setImportStep('url');
      setExtractedRecipe(null);
    }
    setErrors({});
  }, [isOpen, recipe]);

  const updateField = <K extends keyof RecipeCreate>(
    key: K,
    value: RecipeCreate[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (key === 'name') setErrors((e) => ({ ...e, name: undefined }));
    if (key === 'instructions') setErrors((e) => ({ ...e, instructions: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Recipe name is required';
    }

    if (!formData.instructions.trim()) {
      newErrors.instructions = 'Instructions are required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave(formData);
    }
  };

  const handlePreviewReady = (recipe: ExtractedRecipe) => {
    setExtractedRecipe(recipe);
    setImportStep('preview');
  };

  const handleImportSuccess = () => {
    onClose();
  };

  const handleImportBack = () => {
    setImportStep('url');
    setExtractedRecipe(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] mx-4 bg-slate-900 rounded-xl border border-slate-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <h2 className="font-['Space_Grotesk'] text-lg font-semibold text-slate-100">
            {isEditMode ? 'Edit Recipe' : 'Add Recipe'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation - only show for new recipes */}
        {!isEditMode && (
          <div className="px-6 pt-4 shrink-0">
            <div className="flex gap-1 p-1 bg-slate-800 rounded-lg">
              <button
                onClick={() => setActiveTab('manual')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'manual'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Manual Entry
              </button>
              <button
                onClick={() => setActiveTab('import')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'import'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Import from URL
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'import' ? (
            // Import Flow
            importStep === 'url' ? (
              <RecipeImportForm
                onPreviewReady={handlePreviewReady}
                onCancel={() => setActiveTab('manual')}
              />
            ) : extractedRecipe ? (
              <RecipeImportPreview
                recipe={extractedRecipe}
                onSuccess={handleImportSuccess}
                onBack={handleImportBack}
              />
            ) : null
          ) : (
            // Manual Entry Form
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Basic Info Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
                  Basic Info
                </h3>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Recipe Name <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className={`
                      w-full px-3 py-2 rounded-lg
                      bg-slate-800 border
                      ${errors.name ? 'border-amber-500' : 'border-slate-700'}
                      text-slate-200 placeholder:text-slate-500
                      focus:outline-none focus:ring-2 focus:ring-cyan-500
                    `}
                    placeholder="e.g., Overnight Oats"
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-amber-400">{errors.name}</p>
                  )}
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category_id ?? ''}
                    onChange={(e) => updateField('category_id', e.target.value ? Number(e.target.value) : null)}
                    className="
                      w-full px-3 py-2 rounded-lg
                      bg-slate-800 border border-slate-700
                      text-slate-200
                      focus:outline-none focus:ring-2 focus:ring-cyan-500
                    "
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Time and Servings row */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Prep Time
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={formData.prep_time_minutes ?? ''}
                        onChange={(e) => updateField('prep_time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                        className="
                          w-full px-3 py-2 rounded-lg
                          bg-slate-800 border border-slate-700
                          text-slate-200 placeholder:text-slate-500
                          focus:outline-none focus:ring-2 focus:ring-cyan-500
                        "
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">min</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Cook Time
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={formData.cook_time_minutes ?? ''}
                        onChange={(e) => updateField('cook_time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                        className="
                          w-full px-3 py-2 rounded-lg
                          bg-slate-800 border border-slate-700
                          text-slate-200 placeholder:text-slate-500
                          focus:outline-none focus:ring-2 focus:ring-cyan-500
                        "
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">min</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Servings
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.servings ?? ''}
                      onChange={(e) => updateField('servings', e.target.value ? parseInt(e.target.value) : null)}
                      className="
                        w-full px-3 py-2 rounded-lg
                        bg-slate-800 border border-slate-700
                        text-slate-200 placeholder:text-slate-500
                        focus:outline-none focus:ring-2 focus:ring-cyan-500
                      "
                      placeholder="1"
                    />
                  </div>
                </div>
              </div>

              {/* Instructions Section */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
                  Instructions
                </h3>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Instructions <span className="text-amber-400">*</span>
                  </label>
                  <textarea
                    value={formData.instructions}
                    onChange={(e) => updateField('instructions', e.target.value)}
                    rows={8}
                    className={`
                      w-full px-3 py-2 rounded-lg
                      bg-slate-800 border
                      ${errors.instructions ? 'border-amber-500' : 'border-slate-700'}
                      text-slate-200 placeholder:text-slate-500
                      focus:outline-none focus:ring-2 focus:ring-cyan-500
                      resize-none font-mono text-sm
                    `}
                    placeholder="1. First step&#10;2. Second step&#10;3. Third step"
                  />
                  {errors.instructions && (
                    <p className="mt-1 text-xs text-amber-400">{errors.instructions}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    Enter step-by-step instructions
                  </p>
                </div>
              </div>

              {/* Additional Info Section */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
                  Additional Info
                </h3>

                {/* Source */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Source
                  </label>
                  <input
                    type="text"
                    value={formData.source ?? ''}
                    onChange={(e) => updateField('source', e.target.value || null)}
                    className="
                      w-full px-3 py-2 rounded-lg
                      bg-slate-800 border border-slate-700
                      text-slate-200 placeholder:text-slate-500
                      focus:outline-none focus:ring-2 focus:ring-cyan-500
                    "
                    placeholder="URL or cookbook name"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={formData.notes ?? ''}
                    onChange={(e) => updateField('notes', e.target.value || null)}
                    rows={3}
                    className="
                      w-full px-3 py-2 rounded-lg
                      bg-slate-800 border border-slate-700
                      text-slate-200 placeholder:text-slate-500
                      focus:outline-none focus:ring-2 focus:ring-cyan-500
                      resize-none
                    "
                    placeholder="Tips, variations, etc."
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer - only show for manual tab */}
        {activeTab === 'manual' && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="
                px-4 py-2 rounded-lg
                text-sm font-medium text-slate-300
                hover:bg-slate-800 transition-colors
              "
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="
                px-4 py-2 rounded-lg
                bg-cyan-500 hover:bg-cyan-400
                text-sm font-medium text-slate-900
                transition-colors
                focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900
              "
            >
              {isEditMode ? 'Save Changes' : 'Add Recipe'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
