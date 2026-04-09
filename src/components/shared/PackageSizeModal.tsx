/**
 * PackageSizeModal Component
 *
 * V2: Appears during shopping trip completion to let users specify
 * package sizes for purchased items. Quick-select chips for common
 * sizes + custom input. Remembers last purchased size.
 *
 * UX: "What size did you buy?" — fast, one-tap for common sizes.
 * Graceful skip: users can skip to use V1 behavior (cooking amounts).
 */

import { useState, useCallback } from 'react';
import type { ShoppingListItem, PackageDataItem } from '@/api/client';

interface PackageSizeModalProps {
  isOpen: boolean;
  items: ShoppingListItem[];
  onConfirm: (packageData: PackageDataItem[]) => void;
  onSkip: () => void;
}

interface ItemPackageEntry {
  shopping_item_id: number;
  name: string;
  cooking_amount: string;
  package_label: string;
  package_size: number;
  package_unit: string;
  package_type: string;
  useDefault: boolean;
}

// Common package size presets by ingredient type
const COMMON_PRESETS: Record<string, Array<{ label: string; size: number; unit: string; type: string }>> = {
  default: [
    { label: '16 oz', size: 16, unit: 'oz', type: 'container' },
    { label: '32 oz', size: 32, unit: 'oz', type: 'container' },
    { label: '1 lb', size: 1, unit: 'lb', type: 'bag' },
    { label: '5 lb', size: 5, unit: 'lb', type: 'bag' },
  ],
};

export function PackageSizeModal({
  isOpen,
  items,
  onConfirm,
  onSkip,
}: PackageSizeModalProps) {
  // Initialize entries from items that have package data (enriched by backend)
  const [entries, setEntries] = useState<ItemPackageEntry[]>(() =>
    items
      .filter((item) => item.is_checked)
      .map((item) => ({
        shopping_item_id: item.id,
        name: item.name,
        cooking_amount: item.quantity ?? '',
        // Use enriched package data if available, otherwise defaults
        package_label: item.package_display ?? '',
        package_size: item.package_size ?? 0,
        package_unit: item.package_unit ?? 'oz',
        package_type: item.package_type ?? 'container',
        useDefault: !!item.package_display,
      }))
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [customMode, setCustomMode] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const [customUnit, setCustomUnit] = useState('oz');

  const currentEntry = entries[currentIndex];
  const isLastItem = currentIndex >= entries.length - 1;

  const handlePresetSelect = useCallback((preset: { label: string; size: number; unit: string; type: string }) => {
    setEntries((prev) => {
      const updated = [...prev];
      updated[currentIndex] = {
        ...updated[currentIndex],
        package_label: preset.label,
        package_size: preset.size,
        package_unit: preset.unit,
        package_type: preset.type,
        useDefault: true,
      };
      return updated;
    });
    setCustomMode(false);

    if (isLastItem) {
      // Auto-proceed to confirm
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, isLastItem]);

  const handleCustomConfirm = useCallback(() => {
    const size = parseFloat(customSize);
    if (isNaN(size) || size <= 0) return;

    setEntries((prev) => {
      const updated = [...prev];
      updated[currentIndex] = {
        ...updated[currentIndex],
        package_label: `${size} ${customUnit}`,
        package_size: size,
        package_unit: customUnit,
        package_type: 'container',
        useDefault: true,
      };
      return updated;
    });
    setCustomMode(false);
    setCustomSize('');

    if (!isLastItem) {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, customSize, customUnit, isLastItem]);

  const handleConfirm = useCallback(() => {
    const packageData: PackageDataItem[] = entries
      .filter((e) => e.useDefault && e.package_size > 0)
      .map((e) => ({
        shopping_item_id: e.shopping_item_id,
        package_label: e.package_label,
        package_size: e.package_size,
        package_unit: e.package_unit,
        package_type: e.package_type,
      }));

    onConfirm(packageData);
  }, [entries, onConfirm]);

  if (!isOpen || entries.length === 0) return null;

  const presets = COMMON_PRESETS.default;

  // If the item already has enriched package data, show it as first option
  const currentItem = items.find((i) => i.id === currentEntry?.shopping_item_id);
  const hasEnrichedData = currentItem?.package_display;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onSkip} />

      <div className="relative w-full max-w-md mx-4 bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-xl">
        {/* Header */}
        <div className="text-center mb-4">
          <h3 className="font-['Space_Grotesk'] text-lg font-semibold text-slate-100">
            What size did you buy?
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            {currentEntry?.name}
            {currentEntry?.cooking_amount && (
              <span className="text-slate-500"> ({currentEntry.cooking_amount} needed)</span>
            )}
          </p>
          {/* Progress indicator */}
          <p className="text-xs text-slate-500 mt-2">
            Item {currentIndex + 1} of {entries.length}
          </p>
        </div>

        {/* Enriched default (from backend PackageConversion) */}
        {hasEnrichedData && (
          <button
            onClick={() => handlePresetSelect({
              label: currentItem.package_display!,
              size: currentItem.package_size ?? 0,
              unit: currentItem.package_unit ?? 'oz',
              type: currentItem.package_type ?? 'container',
            })}
            className="w-full mb-3 px-4 py-3 rounded-lg border-2 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-medium transition-colors text-left"
          >
            <span className="text-sm">Suggested: </span>
            <span>{currentItem.package_display}</span>
            {currentItem.package_detail && (
              <span className="block text-xs text-slate-400 mt-0.5">{currentItem.package_detail}</span>
            )}
          </button>
        )}

        {/* Quick-select presets */}
        {!customMode && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePresetSelect(preset)}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors border border-slate-600"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {/* Custom input */}
        {customMode ? (
          <div className="flex gap-2 mb-4">
            <input
              type="number"
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              placeholder="Size"
              className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
              autoFocus
              min="0"
              step="0.1"
            />
            <select
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="oz">oz</option>
              <option value="fl oz">fl oz</option>
              <option value="lb">lb</option>
              <option value="count">count</option>
              <option value="gal">gal</option>
              <option value="qt">qt</option>
              <option value="pt">pt</option>
              <option value="cup">cup</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="L">L</option>
            </select>
            <button
              onClick={handleCustomConfirm}
              disabled={!customSize || parseFloat(customSize) <= 0}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Set
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCustomMode(true)}
            className="w-full mb-4 px-3 py-2 text-sm text-slate-400 hover:text-white border border-dashed border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
          >
            Custom size...
          </button>
        )}

        {/* Footer buttons */}
        <div className="flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium text-sm transition-colors"
          >
            Skip All
          </button>
          {(isLastItem || entries.every((e) => e.useDefault)) && (
            <button
              onClick={handleConfirm}
              className="flex-1 px-4 py-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 font-medium text-sm transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
