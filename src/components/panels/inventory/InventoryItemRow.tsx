/**
 * InventoryItemRow — Single inventory item row
 *
 * Displays item name, category, expiration, horizontal fill slider,
 * and edit/delete actions.
 */

import type { InventoryItem, InventoryCategory } from '@/api/client';
import { getStepSize, isLegacyScale, abbreviateUnit } from '@/utils/inventoryHelpers';
import { FillLevelSlider } from './FillLevelSlider';

/** Compute slider props (max, step, label) for any inventory item type. */
function getSliderConfig(item: InventoryItem): { max: number; step: number; label: string } {
  const qty = item.quantity ?? 0;

  // Percentage-tracked items: 0-100 direct
  if (isLegacyScale(item)) {
    return { max: 100, step: 5, label: `${Math.round(qty)}%` };
  }

  const unit = abbreviateUnit(item.quantity_unit ?? item.unit ?? '');

  // Package-tracked items: 0 to package_size — show quantity, not percentage
  if (item.package_size && item.package_size > 0) {
    const qtyStr = Number.isInteger(qty) ? `${qty}` : qty.toFixed(1);
    const maxStr = Number.isInteger(item.package_size) ? `${item.package_size}` : item.package_size.toFixed(1);
    return {
      max: item.package_size,
      step: getStepSize(item),
      label: unit ? `${qtyStr}/${maxStr} ${unit}` : `${qtyStr}/${maxStr}`,
    };
  }

  // Plain count items: stable max based on reasonable ceiling (not auto-expanding)
  const itemStep = getStepSize(item);
  const stableMax = Math.max(itemStep * 10, Math.ceil(qty * 1.5), 12);
  const qtyStr = Number.isInteger(qty) ? `${qty}` : qty.toFixed(1);
  return {
    max: stableMax,
    step: itemStep,
    label: unit ? `${qtyStr} ${unit}` : qtyStr,
  };
}

export interface InventoryItemRowProps {
  item: InventoryItem;
  categories: InventoryCategory[];
  location: 'fridge' | 'pantry' | 'freezer';
  isExpiringSoon: boolean;
  isExpired: boolean;
  isAdjusting?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMarkEmpty: () => void;
  onQuickAdjust: (delta: number) => void;
  onNameClick: () => void;
}

export function InventoryItemRow({
  item,
  categories,
  location,
  isExpiringSoon,
  isExpired,
  isAdjusting = false,
  onEdit,
  onDelete,
  onMarkEmpty,
  onQuickAdjust,
  onNameClick,
}: InventoryItemRowProps) {
  const category = categories.find(c => c.id === item.category_id);
  const isLeftover = item.source === 'leftover';
  const sliderConfig = getSliderConfig(item);

  const formatExpiration = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      if (absDays <= 2) return 'Check freshness';
      if (absDays <= 7) return 'Still good?';
      return 'Needs triage';
    }
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `${diffDays} days`;
    if (diffDays <= 14) return `${Math.ceil(diffDays / 7)} weeks`;
    if (diffDays <= 60) return `${Math.round(diffDays / 7)} weeks`;
    return `${Math.round(diffDays / 30)} months`;
  };

  const locationBorderColor = {
    fridge: 'border-l-cyan-400',
    pantry: 'border-l-amber-400',
    freezer: 'border-l-blue-400',
  }[location];

  return (
    <div
      className={`group flex items-center gap-4 px-3 py-2.5 rounded-lg transition-colors border-l-[3px] ${locationBorderColor} bg-slate-700/50 hover:bg-slate-700`}
    >
      {/* Name and Category */}
      <div className={`flex-1 min-w-0 ${(item.quantity ?? 0) === 0 ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2">
          {isLeftover && (
            <span className="text-amber-400 flex-shrink-0" title={item.original_meal_name ? `From: ${item.original_meal_name}` : 'Leftover'}>
              🍱
            </span>
          )}
          <span
            className={`font-medium cursor-pointer hover:text-cyan-300 truncate ${isExpired ? 'text-amber-300' : 'text-white'}`}
            onClick={onNameClick}
            title={item.name}
          >
            {item.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {category && (
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-700/40 text-slate-400 rounded flex-shrink-0">
              {category.name}
            </span>
          )}
          {item.expiration_date && (
            <span className={`text-xs ${
              isExpired ? 'text-amber-400' : isExpiringSoon ? 'text-amber-400' : 'text-slate-400'
            }`}>
              {formatExpiration(item.expiration_date)}
            </span>
          )}
          {item.original_meal_name && (
            <span className="text-xs text-slate-500 truncate max-w-[8rem]" title={`From: ${item.original_meal_name}`}>
              from {item.original_meal_name}
            </span>
          )}
        </div>
      </div>

      {/* Quantity Controls */}
      <FillLevelSlider
        value={item.quantity ?? 0}
        max={sliderConfig.max}
        step={sliderConfig.step}
        onChange={(newVal) => onQuickAdjust(newVal - (item.quantity ?? 0))}
        label={sliderConfig.label}
        disabled={isAdjusting}
        hasBackup={(item.packages_backup ?? 0) > 0}
        onOpenBackup={() => onQuickAdjust(item.package_size ?? sliderConfig.step)}
        ariaLabel={`Fill level for ${item.name}`}
      />

      {/* Actions — visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-600 rounded"
          title="Edit"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={onMarkEmpty}
          disabled={isAdjusting || (item.quantity ?? 0) === 0}
          className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-600 rounded disabled:opacity-30"
          title="Mark as Empty"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-600 rounded"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
