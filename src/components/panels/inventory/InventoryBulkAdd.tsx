/**
 * InventoryBulkAdd — Bulk add form + Template quick-start
 *
 * BulkAddForm: Sends text to backend parser, displays structured preview
 * TemplateListForm: Predefined common items with checkbox selection
 */

import { useState, useEffect, useRef } from 'react';
import type {
  InventoryItem,
  InventoryItemCreate,
  InventoryCategory,
  StorageLocation,
  ParsedFoodItem,
} from '@/api/client';
import { foodParserApi } from '@/api/client';

const LOCATIONS: { value: StorageLocation; label: string; icon: string }[] = [
  { value: 'fridge', label: 'Fridge', icon: '\u2744\uFE0F' },
  { value: 'pantry', label: 'Pantry', icon: '\uD83C\uDFE0' },
  { value: 'freezer', label: 'Freezer', icon: '\uD83E\uDDCA' },
];

// =============================================================================
// BULK ADD FORM
// =============================================================================

export interface BulkAddFormProps {
  categories: InventoryCategory[];
  onSave: (items: InventoryItemCreate[]) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}

export function BulkAddForm({ categories, onSave, onCancel, isPending }: BulkAddFormProps) {
  const [text, setText] = useState('');
  const [location, setLocation] = useState<StorageLocation>('pantry');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedFoodItem[]>([]);
  const [formatDetected, setFormatDetected] = useState<'simple' | 'csv'>('simple');
  const [parsing, setParsing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleTextChange = (value: string) => {
    setText(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (!trimmed) {
      setParsedItems([]);
      setFormatDetected('simple');
      return;
    }

    setParsing(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await foodParserApi.preview(trimmed, 'inventory');
        setParsedItems(response.items);
        setFormatDetected(response.format_detected as 'csv' | 'simple');
      } catch {
        // Fallback: keep existing items, don't clear on transient errors
      } finally {
        setParsing(false);
      }
    }, 300);
  };

  const findCategoryByName = (name: string | null): number | null => {
    if (!name) return null;
    const cat = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    return cat?.id ?? null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedItems.length === 0) return;

    const items: InventoryItemCreate[] = parsedItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      location,
      category_id: categoryId ?? findCategoryByName(item.category_hint),
      expiration_date: item.expiration_date,
      notes: item.notes,
      package_size: item.package_size ?? null,
      package_unit: item.package_unit ?? null,
    }));

    await onSave(items);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Bulk Add Items</h3>

      <div className="flex-1 space-y-4">
        <div className="p-3 bg-slate-700/30 rounded-lg text-sm text-slate-400">
          <p>Enter one item per line, or paste CSV data.</p>
          <div className="mt-1 space-y-1">
            <p className="text-slate-500">Simple: <code className="text-cyan-400">2 cans diced tomatoes</code></p>
            <p className="text-slate-500">CSV: <code className="text-cyan-400">Category, Item, Size, Qty, Expiration, Note</code></p>
          </div>
          {formatDetected === 'csv' && parsedItems.length > 0 && (
            <p className="mt-2 text-cyan-400 font-medium">CSV format detected</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Default Location</label>
          <div className="grid grid-cols-3 gap-2">
            {LOCATIONS.map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setLocation(value)}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  location === value
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

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Default Category</label>
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">None</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Items</label>
          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={6}
            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 font-mono text-sm"
            placeholder={"Milk, 2 gal\nEggs\n2 (14.5 oz) cans diced tomatoes"}
          />
        </div>

        {(parsedItems.length > 0 || parsing) && (
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              {parsing ? 'Parsing...' : `Preview (${parsedItems.length} items)`}
            </label>
            <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-slate-800/50 rounded-lg">
              {parsedItems.map((item, i) => (
                <div key={i} className="text-sm text-slate-300 flex items-center gap-2 flex-wrap">
                  <span className="text-emerald-400 flex-shrink-0">{'\u2713'}</span>
                  <span className="font-medium">{item.name}</span>
                  <span className="text-slate-500">{'\u00D7'}{item.quantity}</span>
                  {item.unit && <span className="text-slate-500">{item.unit}</span>}
                  {item.package_size && item.package_unit && (
                    <span className="text-violet-400/80 text-xs">
                      ({item.package_size} {item.package_unit})
                    </span>
                  )}
                  {item.expiration_date && (
                    <span className="text-amber-400/80 text-xs">exp {item.expiration_date}</span>
                  )}
                  {item.category_hint && (
                    <span className="text-cyan-400/60 text-xs">[{item.category_hint}]</span>
                  )}
                  {item.notes && (
                    <span className="text-slate-500 text-xs italic truncate max-w-[120px]">{item.notes}</span>
                  )}
                </div>
              ))}
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
          disabled={isPending || parsedItems.length === 0 || parsing}
          className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isPending ? 'Adding...' : `Add ${parsedItems.length} Items`}
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// TEMPLATE LIST FORM - Quick Start with common items
// =============================================================================

const TEMPLATE_ITEMS: Record<StorageLocation, { name: string; unit?: string; category?: string }[]> = {
  pantry: [
    { name: 'Rice', unit: 'lbs', category: 'Grains' },
    { name: 'Pasta', unit: 'boxes', category: 'Grains' },
    { name: 'Bread', unit: 'loaf', category: 'Grains' },
    { name: 'Oatmeal', unit: 'boxes', category: 'Grains' },
    { name: 'Flour', unit: 'lbs', category: 'Baking' },
    { name: 'Canned Tomatoes', unit: 'cans', category: 'Canned' },
    { name: 'Canned Beans', unit: 'cans', category: 'Canned' },
    { name: 'Canned Tuna', unit: 'cans', category: 'Canned' },
    { name: 'Chicken Broth', unit: 'cans', category: 'Canned' },
    { name: 'Coconut Milk', unit: 'cans', category: 'Canned' },
    { name: 'Olive Oil', unit: 'bottles', category: 'Oils' },
    { name: 'Vegetable Oil', unit: 'bottles', category: 'Oils' },
    { name: 'Soy Sauce', unit: 'bottles', category: 'Condiments' },
    { name: 'Vinegar', unit: 'bottles', category: 'Condiments' },
    { name: 'Hot Sauce', unit: 'bottles', category: 'Condiments' },
    { name: 'Salt', category: 'Spices' },
    { name: 'Black Pepper', category: 'Spices' },
    { name: 'Garlic Powder', category: 'Spices' },
    { name: 'Onion Powder', category: 'Spices' },
    { name: 'Paprika', category: 'Spices' },
    { name: 'Cumin', category: 'Spices' },
    { name: 'Italian Seasoning', category: 'Spices' },
    { name: 'Sugar', unit: 'lbs', category: 'Baking' },
    { name: 'Brown Sugar', unit: 'lbs', category: 'Baking' },
    { name: 'Baking Soda', category: 'Baking' },
    { name: 'Baking Powder', category: 'Baking' },
    { name: 'Vanilla Extract', category: 'Baking' },
    { name: 'Chips', unit: 'bags', category: 'Snacks' },
    { name: 'Crackers', unit: 'boxes', category: 'Snacks' },
    { name: 'Nuts', unit: 'bags', category: 'Snacks' },
    { name: 'Peanut Butter', unit: 'jars', category: 'Spreads' },
    { name: 'Honey', unit: 'bottles', category: 'Spreads' },
  ],
  fridge: [
    { name: 'Milk', unit: 'gal', category: 'Dairy' },
    { name: 'Eggs', unit: 'dozen', category: 'Dairy' },
    { name: 'Butter', unit: 'sticks', category: 'Dairy' },
    { name: 'Cheese', unit: 'blocks', category: 'Dairy' },
    { name: 'Yogurt', unit: 'cups', category: 'Dairy' },
    { name: 'Cream Cheese', unit: 'blocks', category: 'Dairy' },
    { name: 'Sour Cream', category: 'Dairy' },
    { name: 'Lettuce', unit: 'heads', category: 'Produce' },
    { name: 'Tomatoes', category: 'Produce' },
    { name: 'Onions', category: 'Produce' },
    { name: 'Garlic', unit: 'heads', category: 'Produce' },
    { name: 'Carrots', unit: 'lbs', category: 'Produce' },
    { name: 'Celery', unit: 'stalks', category: 'Produce' },
    { name: 'Bell Peppers', category: 'Produce' },
    { name: 'Lemons', category: 'Produce' },
    { name: 'Limes', category: 'Produce' },
    { name: 'Chicken Breast', unit: 'lbs', category: 'Meat' },
    { name: 'Ground Beef', unit: 'lbs', category: 'Meat' },
    { name: 'Bacon', unit: 'packs', category: 'Meat' },
    { name: 'Deli Meat', unit: 'packs', category: 'Meat' },
    { name: 'Ketchup', category: 'Condiments' },
    { name: 'Mustard', category: 'Condiments' },
    { name: 'Mayo', category: 'Condiments' },
    { name: 'Salsa', category: 'Condiments' },
    { name: 'Orange Juice', unit: 'gal', category: 'Beverages' },
    { name: 'Almond Milk', unit: 'cartons', category: 'Beverages' },
  ],
  freezer: [
    { name: 'Frozen Chicken', unit: 'lbs', category: 'Frozen Meat' },
    { name: 'Frozen Fish', unit: 'lbs', category: 'Frozen Meat' },
    { name: 'Frozen Shrimp', unit: 'lbs', category: 'Frozen Meat' },
    { name: 'Ground Turkey', unit: 'lbs', category: 'Frozen Meat' },
    { name: 'Frozen Peas', unit: 'bags', category: 'Frozen Veggies' },
    { name: 'Frozen Corn', unit: 'bags', category: 'Frozen Veggies' },
    { name: 'Frozen Broccoli', unit: 'bags', category: 'Frozen Veggies' },
    { name: 'Frozen Mixed Vegetables', unit: 'bags', category: 'Frozen Veggies' },
    { name: 'Frozen Spinach', unit: 'bags', category: 'Frozen Veggies' },
    { name: 'Frozen Berries', unit: 'bags', category: 'Frozen Fruit' },
    { name: 'Frozen Bananas', unit: 'bags', category: 'Frozen Fruit' },
    { name: 'Frozen Pizza', category: 'Prepared' },
    { name: 'Ice Cream', unit: 'pints', category: 'Desserts' },
    { name: 'Frozen Waffles', unit: 'boxes', category: 'Breakfast' },
    { name: 'Frozen Burritos', unit: 'packs', category: 'Prepared' },
  ],
};

export interface TemplateListFormProps {
  categories: InventoryCategory[];
  existingItems: InventoryItem[];
  onSave: (items: InventoryItemCreate[]) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}

export function TemplateListForm({ categories, existingItems, onSave, onCancel, isPending }: TemplateListFormProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [activeLocation, setActiveLocation] = useState<StorageLocation>('pantry');

  const getItemKey = (loc: StorageLocation, name: string) => `${loc}:${name}`;

  const itemExists = (name: string) => {
    const normalizedName = name.toLowerCase();
    return existingItems.some(item => item.name.toLowerCase() === normalizedName);
  };

  const toggleItem = (loc: StorageLocation, name: string) => {
    const key = getItemKey(loc, name);
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllInLocation = () => {
    const items = TEMPLATE_ITEMS[activeLocation];
    setSelectedItems(prev => {
      const next = new Set(prev);
      items.forEach(item => {
        if (!itemExists(item.name)) {
          next.add(getItemKey(activeLocation, item.name));
        }
      });
      return next;
    });
  };

  const clearAllInLocation = () => {
    const items = TEMPLATE_ITEMS[activeLocation];
    setSelectedItems(prev => {
      const next = new Set(prev);
      items.forEach(item => {
        next.delete(getItemKey(activeLocation, item.name));
      });
      return next;
    });
  };

  const countSelected = (loc: StorageLocation) => {
    return TEMPLATE_ITEMS[loc].filter(item =>
      selectedItems.has(getItemKey(loc, item.name))
    ).length;
  };

  const findCategoryId = (categoryName?: string): number | null => {
    if (!categoryName) return null;
    const cat = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    return cat?.id ?? null;
  };

  const handleSubmit = async () => {
    const itemsToCreate: InventoryItemCreate[] = [];

    selectedItems.forEach(key => {
      const [loc, name] = key.split(':') as [StorageLocation, string];
      const template = TEMPLATE_ITEMS[loc].find(t => t.name === name);
      if (template) {
        itemsToCreate.push({
          name: template.name,
          quantity: 1,
          unit: template.unit || null,
          location: loc,
          category_id: findCategoryId(template.category),
          expiration_date: null,
          notes: null,
        });
      }
    });

    await onSave(itemsToCreate);
  };

  const totalSelected = selectedItems.size;
  const locationItems = TEMPLATE_ITEMS[activeLocation];

  return (
    <div className="flex flex-col h-full p-6">
      <h3 className="text-lg font-semibold text-white mb-2">Quick Start - Common Items</h3>
      <p className="text-sm text-slate-400 mb-4">
        Check off what you already have. Items already in your inventory are grayed out.
      </p>

      <div className="flex gap-2 mb-4">
        {LOCATIONS.map(({ value, label, icon }) => {
          const count = countSelected(value);
          return (
            <button
              key={value}
              onClick={() => setActiveLocation(value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                activeLocation === value
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:border-slate-500'
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
              {count > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-cyan-500/30 text-cyan-300 rounded">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 mb-3">
        <button onClick={selectAllInLocation} className="text-xs text-cyan-400 hover:text-cyan-300">
          Select all new items
        </button>
        <span className="text-slate-600">|</span>
        <button onClick={clearAllInLocation} className="text-xs text-slate-400 hover:text-slate-300">
          Clear selection
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          {locationItems.map(item => {
            const key = getItemKey(activeLocation, item.name);
            const isSelected = selectedItems.has(key);
            const exists = itemExists(item.name);

            return (
              <button
                key={item.name}
                onClick={() => !exists && toggleItem(activeLocation, item.name)}
                disabled={exists}
                className={`
                  flex items-center gap-3 p-3 rounded-lg border text-left transition-all
                  ${exists
                    ? 'bg-slate-800/30 border-slate-700/50 text-slate-500 cursor-not-allowed'
                    : isSelected
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-slate-500'
                  }
                `}
              >
                <span
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                    exists
                      ? 'bg-slate-600 border-slate-600'
                      : isSelected
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-slate-500'
                  }`}
                >
                  {(isSelected || exists) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>

                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${exists ? 'line-through' : ''}`}>
                    {item.name}
                  </div>
                  {item.category && (
                    <div className="text-xs text-slate-500">{item.category}</div>
                  )}
                </div>

                {exists && (
                  <span className="text-xs text-slate-500 whitespace-nowrap">In inventory</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-slate-400">
            {totalSelected} item{totalSelected !== 1 ? 's' : ''} selected
          </span>
          {totalSelected > 0 && (
            <span className="text-sm text-emerald-400">Ready to add to inventory</span>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || totalSelected === 0}
            className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Adding...' : `Add ${totalSelected} Items`}
          </button>
        </div>
      </div>
    </div>
  );
}
