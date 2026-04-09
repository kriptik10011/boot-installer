/**
 * ShoppingJunction — NW junction widget for shopping list management.
 * Uses unified shapes: JunctionCardLayout, ScrollZone, ActionBar, FormField,
 * PillList (checkable), ButtonGroup.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useShoppingListWeek, useToggleShoppingListItem, useGenerateShoppingList, useCompleteShoppingTrip, useCreateShoppingListItem, shoppingListKeys } from '@/hooks/useShoppingList';
import type { ShoppingListItem } from '@/api/client';
import { shoppingListApi } from '@/api/client';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { PackageSizeModal } from '@/components/shared/PackageSizeModal';
import type { PackageDataItem } from '@/api/client';
import { getMonday, addWeeks } from '@/utils/dateUtils';
import { CARD_SIZES, FONT_FAMILY, COLUMN_HEADER_STYLE } from '../cardTemplate';
import { ActionBar, type ActionItem } from '../shapes/ActionBar';
import { FormField } from '../shapes/FormField';
import { PillList, type PillListItem } from '../shapes/PillList';
import { ButtonGroup } from '../shapes/ButtonGroup';
import { JunctionCardLayout } from '../shapes/JunctionCardLayout';
import { ScrollZone } from '../shapes/ScrollZone';
import { arcPath } from '../cards/shared/arcHelpers';
import { lerpHex } from '../utils/bezelHelpers';
// ── Constants ────────────────────────────────────────────────────────────────

const WEEK_OPTIONS = [
  { label: 'This Week', value: '0' },
  { label: 'Next Week', value: '1' },
] as const;

// ── Bezel SVG ────────────────────────────────────────────────────────────────

/**
 * ShoppingBezelSvg — 360 deg hairline progress ring.
 * Deep amber → amber → vibrant green color ramp.
 * Subtle glow, intensifying from 85% onward.
 */
export function ShoppingBezelSvg({ progress, size, color }: { progress: number; size: number; color: string }): ReactNode {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.98;
  const strokeW = size * 0.004;
  const intense = progress >= 0.85;

  const trackPath = arcPath(cx, cy, r, -90, 359.99);
  const fillSweep = 359.99 * Math.max(0, Math.min(1, progress));
  const fillPath = fillSweep > 0.01 ? arcPath(cx, cy, r, -90, fillSweep) : '';

  return (
    <g>
      <defs>
        <filter id="shop-bezel-glow" x="0" y="0" width={size} height={size} filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation={intense ? 6 : 4} />
        </filter>
      </defs>
      <path d={trackPath} fill="none" stroke={color} strokeWidth={strokeW} strokeOpacity={0.12} strokeLinecap="round" />
      {fillPath && (
        <path d={fillPath} fill="none" stroke={color} strokeWidth={strokeW * (intense ? 3 : 2)}
          strokeOpacity={intense ? 0.4 : 0.2} strokeLinecap="round" filter="url(#shop-bezel-glow)" />
      )}
      {fillPath && (
        <path d={fillPath} fill="none" stroke={color} strokeWidth={strokeW}
          strokeOpacity={intense ? 0.95 : 0.7} strokeLinecap="round" />
      )}
    </g>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ShoppingJunctionWidget() {
  const [weekOffset, setWeekOffset] = useState(0);
  const periodStart = weekOffset === 0 ? getMonday() : addWeeks(getMonday(), weekOffset);
  const { data: items } = useShoppingListWeek(periodStart);
  const toggleItem = useToggleShoppingListItem();
  const generateList = useGenerateShoppingList();
  const completeTrip = useCompleteShoppingTrip();
  const createItem = useCreateShoppingListItem();
  const [addName, setAddName] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const togglingIdsRef = useRef<Set<number>>(new Set());
  const { requestDelete } = useUndoDelete<ShoppingListItem>({
    entityLabel: 'item',
    getItemName: (item) => item.name,
    getItemId: (item) => item.id,
    listQueryKeys: [shoppingListKeys.week(periodStart)],
    deleteFn: (id) => shoppingListApi.delete(id),
  });
  const setLatticePrefs = useAppStore((s) => s.setLatticePrefs);
  const shoppingMode = useAppStore((s) => s.latticePrefs.shoppingMode);

  const allItems = items ?? [];
  const unchecked = allItems.filter((i) => !i.is_checked);
  const checked = allItems.filter((i) => i.is_checked);
  const total = allItems.length;
  const checkedCount = checked.length;
  const bothColumnsVisible = unchecked.length > 0 && checked.length > 0;
  const hasPackageItems = checked.some((i) => i.package_display);

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const handleToggle = useCallback((id: number) => {
    if (togglingIdsRef.current.has(id)) return;
    togglingIdsRef.current.add(id);
    toggleItem.mutate(id, {
      onSettled: () => { togglingIdsRef.current.delete(id); },
    });
  }, [toggleItem]);

  const handleGenerate = useCallback(() => {
    generateList.mutate(periodStart);
  }, [generateList, periodStart]);

  const handleComplete = useCallback(() => {
    if (checkedCount === 0) return;
    if (hasPackageItems) {
      setShowPackageModal(true);
    } else {
      setShowConfirmComplete(true);
    }
  }, [checkedCount, hasPackageItems]);

  const confirmComplete = useCallback(() => {
    setShowConfirmComplete(false);
    completeTrip.mutate({ weekStart: periodStart });
  }, [completeTrip, periodStart]);

  const completeWithPackageData = useCallback((packageData?: PackageDataItem[]) => {
    setShowPackageModal(false);
    completeTrip.mutate({ weekStart: periodStart, packageData });
  }, [completeTrip, periodStart]);

  const toggleShoppingMode = useCallback(() => {
    setLatticePrefs({ shoppingMode: !shoppingMode });
  }, [setLatticePrefs, shoppingMode]);

  const submitAdd = useCallback(() => {
    const trimmed = addName.trim();
    if (!trimmed || createItem.isPending) return;
    createItem.mutate(
      { name: trimmed, week_start: periodStart },
      { onSuccess: () => { setAddName(''); setShowAddInput(false); } },
    );
  }, [addName, createItem, periodStart]);

  const handleAddKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') submitAdd();
    else if (e.key === 'Escape') { setShowAddInput(false); setAddName(''); }
  }, [submitAdd]);

  // ── PillList item builders ─────────────────────────────────────────────────

  const uncheckedItems: PillListItem[] = unchecked.map((item) => ({
    label: item.name,
    badge: item.package_display || (item.quantity ? String(item.quantity) : undefined),
    checked: false,
    onCheckChange: () => handleToggle(item.id),
    checkColor: 'rgba(251, 146, 60, 0.6)',
    onItemAction: () => requestDelete(item),
    actionLabel: '\u00d7',
  }));

  const checkedItems: PillListItem[] = checked.map((item) => ({
    label: item.name,
    badge: item.package_display || (item.quantity ? String(item.quantity) : undefined),
    checked: true,
    strikethrough: true,
    onCheckChange: () => handleToggle(item.id),
    checkColor: 'rgba(74, 222, 128, 0.4)',
    onItemAction: () => requestDelete(item),
    actionLabel: '\u00d7',
  }));

  // ── Action bar items ───────────────────────────────────────────────────────

  const actionItems: ActionItem[] = [
    { label: shoppingMode ? 'Exit' : 'Shop', onClick: toggleShoppingMode, variant: 'amber' },
    { label: generateList.isPending ? '...' : 'Generate', onClick: handleGenerate, variant: 'orange', disabled: generateList.isPending },
    ...(checkedCount > 0 ? [{
      label: completeTrip.isPending ? '...' : `Done (${checkedCount})`,
      onClick: handleComplete,
      variant: 'green' as const,
      disabled: completeTrip.isPending,
    }] : []),
    { label: showAddInput ? 'Cancel' : '+ Add', onClick: () => { setShowAddInput(!showAddInput); setAddName(''); }, variant: 'cyan' as const },
  ];

  // ── Inline add row ─────────────────────────────────────────────────────────

  const addRow = showAddInput && (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8cqi', flexShrink: 0, paddingBottom: '0.5cqi' }}>
      <div style={{ flex: 1 }}>
        <FormField
          type="text"
          label="Item name"
          value={addName}
          onChange={setAddName}
          placeholder="Item name..."
          onKeyDown={handleAddKeyDown}
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
      </div>
      <ActionBar
        actions={[{
          label: createItem.isPending ? '...' : 'Add',
          onClick: submitAdd,
          variant: 'cyan',
          disabled: !addName.trim() || createItem.isPending,
        }]}
      />
    </div>
  );

  // ── Empty state ────────────────────────────────────────────────────────────

  if (total === 0) {
    return (
      <JunctionCardLayout className="items-center justify-center">
        <ButtonGroup options={WEEK_OPTIONS} value={String(weekOffset)} onChange={(v) => setWeekOffset(Number(v))} size="sm" />
        <div style={{ ...COLUMN_HEADER_STYLE, color: '#fb923c', fontSize: `${CARD_SIZES.labelText}cqi` }}>EMPTY</div>
        <div style={{ fontSize: `${CARD_SIZES.statusText}cqi`, color: '#64748b', fontFamily: FONT_FAMILY, textAlign: 'center' }}>
          no items {weekOffset === 0 ? 'this' : 'next'} week
        </div>
        <ActionBar actions={[
          { label: generateList.isPending ? 'Generating...' : 'Generate', onClick: handleGenerate, variant: 'orange', disabled: generateList.isPending },
          { label: '+ Add', onClick: () => setShowAddInput(!showAddInput), variant: 'cyan' },
        ]} />
        {addRow}
      </JunctionCardLayout>
    );
  }

  // ── Populated state ────────────────────────────────────────────────────────

  return (
    <JunctionCardLayout className="items-center">
      {/* Header: week toggle + counter (normal mode) */}
      {!shoppingMode && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ paddingBottom: '0.3cqi' }}>
            <ButtonGroup options={WEEK_OPTIONS} value={String(weekOffset)} onChange={(v) => setWeekOffset(Number(v))} size="sm" />
          </div>
          <div style={{ ...COLUMN_HEADER_STYLE, color: '#fb923c' }}>{checkedCount}/{total} items</div>
        </div>
      )}

      {/* Action buttons */}
      <ActionBar actions={actionItems} />
      {addRow}

      {/* Scrollable item columns — ScrollZone hides native scrollbar for circular safety */}
      <ScrollZone>
        <div style={{ display: 'flex', gap: 0, minHeight: '100%' }}>
          {unchecked.length > 0 && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <PillList items={uncheckedItems} showCheckboxes maxItems={200} />
            </div>
          )}
          {bothColumnsVisible && (
            <div style={{ width: '1px', background: 'rgba(100, 116, 139, 0.15)', alignSelf: 'stretch' }} />
          )}
          {checked.length > 0 && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <PillList items={checkedItems} showCheckboxes maxItems={200} />
            </div>
          )}
        </div>
      </ScrollZone>

      <PackageSizeModal
        isOpen={showPackageModal}
        items={allItems}
        onConfirm={(packageData) => completeWithPackageData(packageData)}
        onSkip={() => completeWithPackageData()}
      />

      <ConfirmationModal
        isOpen={showConfirmComplete}
        title="Complete Shopping Trip?"
        message={`Transfer ${checkedCount} checked item${checkedCount !== 1 ? 's' : ''} to inventory?`}
        confirmLabel="Transfer to Inventory"
        confirmVariant="primary"
        onConfirm={confirmComplete}
        onCancel={() => setShowConfirmComplete(false)}
        isLoading={completeTrip.isPending}
      />
    </JunctionCardLayout>
  );
}
