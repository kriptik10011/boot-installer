/**
 * InventoryForms — Add and Edit item forms
 *
 * AddItemForm: Single-item creation with name, quantity, unit, location, category, expiration, notes
 * EditItemForm: Same fields pre-populated from existing item
 */

import { useState } from 'react';
import type {
  InventoryItem,
  InventoryItemCreate,
  InventoryItemUpdate,
  InventoryCategory,
  StorageLocation,
} from '@/api/client';

const LOCATIONS: { value: StorageLocation; label: string; icon: string }[] = [
  { value: 'fridge', label: 'Fridge', icon: '❄️' },
  { value: 'pantry', label: 'Pantry', icon: '🏠' },
  { value: 'freezer', label: 'Freezer', icon: '🧊' },
];

// Canonical values match backend normalize_unit() output.
// Labels are user-friendly display strings.
export const COMMON_UNITS: { value: string; label: string }[] = [
  { value: 'count', label: 'count' },
  { value: 'pound', label: 'lbs' },
  { value: 'ounce', label: 'oz' },
  { value: 'gallon', label: 'gal' },
  { value: 'quart', label: 'qt' },
  { value: 'cup', label: 'cups' },
  { value: 'bag', label: 'bags' },
  { value: 'box', label: 'boxes' },
  { value: 'can', label: 'cans' },
  { value: 'bottle', label: 'bottles' },
  { value: 'pack', label: 'packs' },
  { value: 'jar', label: 'jars' },
  { value: 'stick', label: 'sticks' },
  { value: 'loaf', label: 'loaves' },
  { value: 'carton', label: 'cartons' },
];

// Frontend alias map mirroring backend UNIT_ALIASES for common abbreviations.
// Maps non-canonical strings to COMMON_UNITS canonical values.
const UNIT_ALIAS_MAP: Record<string, string> = {
  lb: 'pound', lbs: 'pound', pounds: 'pound',
  oz: 'ounce', ounces: 'ounce',
  gal: 'gallon', gallons: 'gallon',
  qt: 'quart', quarts: 'quart',
  cups: 'cup',
  bags: 'bag', boxes: 'box', cans: 'can', bottles: 'bottle',
  packs: 'pack', jars: 'jar', sticks: 'stick', loaves: 'loaf', cartons: 'carton',
  piece: 'count', pieces: 'count', each: 'count',
};

/** Map a possibly non-canonical unit string to its canonical COMMON_UNITS value. */
export function toCanonicalUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  // Already a canonical value?
  if (COMMON_UNITS.some(u => u.value === unit)) return unit;
  // Check alias map
  const aliased = UNIT_ALIAS_MAP[unit.toLowerCase()];
  if (aliased) return aliased;
  // Check display labels
  const byLabel = COMMON_UNITS.find(u => u.label.toLowerCase() === unit.toLowerCase());
  if (byLabel) return byLabel.value;
  return unit;
}

// =============================================================================
// ADD ITEM FORM
// =============================================================================

export interface AddItemFormProps {
  categories: InventoryCategory[];
  onSave: (data: InventoryItemCreate) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}

export function AddItemForm({ categories, onSave, onCancel, isPending }: AddItemFormProps) {
  const [form, setForm] = useState<InventoryItemCreate>({
    name: '',
    quantity: 1,
    unit: null,
    category_id: null,
    location: 'pantry',
    expiration_date: null,
    notes: null,
  });
  const [showMore, setShowMore] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Add Item</h3>

      <div className="flex-1 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            placeholder="e.g., Milk"
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Quantity *</label>
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })}
              min="0"
              step="any"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Unit</label>
            <select
              value={form.unit || ''}
              onChange={(e) => setForm({ ...form, unit: e.target.value || null })}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">None</option>
              {COMMON_UNITS.map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Location *</label>
          <div className="grid grid-cols-3 gap-2">
            {LOCATIONS.map(({ value, label, icon }) => (
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

        {!showMore && (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            More options...
          </button>
        )}

        {showMore && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Category</label>
              <select
                value={form.category_id ?? ''}
                onChange={(e) => setForm({ ...form, category_id: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">None</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Expiration Date</label>
              <input
                type="date"
                value={form.expiration_date || ''}
                onChange={(e) => setForm({ ...form, expiration_date: e.target.value || null })}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Notes</label>
              <textarea
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                rows={2}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
                placeholder="Optional notes..."
              />
            </div>
          </>
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
          disabled={isPending || !form.name.trim()}
          className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isPending ? 'Adding...' : 'Add Item'}
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// EDIT ITEM FORM
// =============================================================================

export interface EditItemFormProps {
  item: InventoryItem;
  categories: InventoryCategory[];
  onSave: (data: InventoryItemUpdate) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}

export function EditItemForm({ item, categories, onSave, onCancel, isPending }: EditItemFormProps) {
  // Use quantity_unit (authoritative canonical) falling back to unit
  const [form, setForm] = useState<InventoryItemUpdate>({
    name: item.name,
    quantity: item.quantity,
    unit: toCanonicalUnit(item.quantity_unit ?? item.unit),
    category_id: item.category_id,
    location: item.location,
    expiration_date: item.expiration_date,
    notes: item.notes,
    package_size: item.package_size ?? null,
    package_unit: toCanonicalUnit(item.package_unit),
    packages_count: item.packages_count ?? null,
    packages_backup: item.packages_backup ?? null,
    adjustment_step: item.adjustment_step ?? null,
  });
  const hasOptionalData = !!(item.category_id || item.expiration_date || item.notes);
  const hasPackageData = !!(item.package_size || item.package_unit);
  const [showMore, setShowMore] = useState(hasOptionalData);
  const [showPackage, setShowPackage] = useState(hasPackageData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) return;
    await onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Edit Item</h3>

      {/* Package tracking toggle */}
      {!showPackage && (
        <button
          type="button"
          onClick={() => setShowPackage(true)}
          className="mb-3 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          + Add package tracking...
        </button>
      )}

      {showPackage && (
        <div className="mb-4 p-3 bg-slate-700/30 border border-slate-600/50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">Package Tracking</span>
            <button
              type="button"
              onClick={() => {
                setShowPackage(false);
                setForm({ ...form, package_size: null, package_unit: null, packages_count: null, packages_backup: null, adjustment_step: null });
              }}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Package Size</label>
              <input
                type="number"
                value={form.package_size ?? ''}
                onChange={(e) => setForm({ ...form, package_size: e.target.value === '' ? null : Number(e.target.value) })}
                min="0"
                step="any"
                placeholder="e.g. 500"
                className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Package Unit</label>
              <select
                value={form.package_unit ?? ''}
                onChange={(e) => setForm({ ...form, package_unit: e.target.value || null })}
                className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value="">None</option>
                {COMMON_UNITS.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Backup Packages</label>
              <input
                type="number"
                value={form.packages_backup ?? ''}
                onChange={(e) => setForm({ ...form, packages_backup: e.target.value === '' ? null : Number(e.target.value) })}
                min="0"
                step="1"
                placeholder="0"
                className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">+/- Step Size</label>
              <input
                type="number"
                value={form.adjustment_step ?? ''}
                onChange={(e) => setForm({ ...form, adjustment_step: e.target.value === '' ? null : Number(e.target.value) })}
                min="0"
                step="any"
                placeholder="Auto"
                className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Name *</label>
          <input
            type="text"
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Quantity *</label>
            <input
              type="number"
              value={form.quantity ?? 0}
              onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })}
              min="0"
              step="any"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Unit</label>
            <select
              value={form.unit || ''}
              onChange={(e) => setForm({ ...form, unit: e.target.value || null })}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">None</option>
              {COMMON_UNITS.map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Location *</label>
          <div className="grid grid-cols-3 gap-2">
            {LOCATIONS.map(({ value, label, icon }) => (
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

        {!showMore && (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            More options...
          </button>
        )}

        {showMore && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Category</label>
              <select
                value={form.category_id ?? ''}
                onChange={(e) => setForm({ ...form, category_id: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">None</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Expiration Date</label>
              <input
                type="date"
                value={form.expiration_date || ''}
                onChange={(e) => setForm({ ...form, expiration_date: e.target.value || null })}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Notes</label>
              <textarea
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                rows={2}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>
          </>
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
          disabled={isPending || !form.name?.trim()}
          className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
