/**
 * InventoryOverviewCard — Inventory sub-arc "INVENTORY" card.
 *
 * Default: CircularCardLayout with health hero + 3 location PillLists.
 * Browse: formZone with search + category-grouped items + adjust buttons.
 * Edit: formZone with full item edit form (InventoryEditForm).
 * No OverlayShell — all states are formZone swaps within CircularCardLayout.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  useInventoryItems,
  useAdjustQuantity,
  useUpdateInventoryItem,
  useInventoryCategories,
  inventoryKeys,
} from '@/hooks';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { inventoryApi } from '@/api';
import { useToastStore } from '@/stores/toastStore';
import { toCanonicalUnit } from '@/components/panels/inventory/InventoryForms';
import { getStepSize, formatQuantity, isLegacyScale } from '@/utils/inventoryHelpers';
import type { InventoryItem, StorageLocation, InventoryItemUpdate } from '@/api/client';
import { CIRCULAR_ROOT_STYLE, SUB_ARC_ACCENTS, FONT_FAMILY, TEXT_COLORS } from '../../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList, FormField, ScrollZone } from '../../shapes';
import type { PillListItem } from '../../shapes';
import { ActionBar } from '../../shapes/ActionBar';
import {
  useInventoryOverviewHeroAdapter,
  usePantryPillsAdapter,
  useFridgePillsAdapter,
  useFreezerPillsAdapter,
} from '../../registry/adapters/inventoryAdapters';
import { InventoryEditForm, type EditForm } from './InventoryEditPopup';

type CardMode =
  | { mode: 'default' }
  | { mode: 'browse'; location: StorageLocation; label: string }
  | { mode: 'edit'; item: InventoryItem };

const ACCENT = SUB_ARC_ACCENTS.inventory;

export function InventoryOverviewCard() {
  const hero = useInventoryOverviewHeroAdapter();
  const pantry = usePantryPillsAdapter();
  const fridge = useFridgePillsAdapter();
  const freezer = useFreezerPillsAdapter();

  const { data: rawItems = [] } = useInventoryItems();
  const { data: categories = [] } = useInventoryCategories();
  const adjustQuantity = useAdjustQuantity();
  const updateItem = useUpdateInventoryItem();
  const addToast = useToastStore((s) => s.addToast);

  const items = useMemo(
    () => rawItems.filter(i => i.quantity > 0 || isLegacyScale(i)),
    [rawItems],
  );

  const [cardMode, setCardMode] = useState<CardMode>({ mode: 'default' });
  const [searchTerm, setSearchTerm] = useState('');
  const [editForm, setEditForm] = useState<EditForm>({
    name: '', category_id: null, location: 'pantry', quantity: 0,
    unit: null, package_size: null, package_unit: null, packages_count: null,
    adjustment_step: null, expiration_date: null, expiration_auto_filled: false, notes: null,
  });

  const { requestDelete } = useUndoDelete<InventoryItem>({
    entityLabel: 'item',
    getItemName: (item) => item.name,
    getItemId: (item) => item.id,
    listQueryKeys: [inventoryKeys.items()],
    deleteFn: (id) => inventoryApi.deleteItem(id),
    invalidateKeys: [inventoryKeys.all],
  });

  // ─── Pill enrichment ──────────────────────────────────────────────────────

  const withOverlayClick = (
    pills: { items: readonly PillListItem[]; header?: string; headerColor?: string; emptyMessage?: string; maxItems?: number },
    location: StorageLocation,
    label: string,
  ) => ({
    ...pills,
    items: pills.items.map(item => ({
      ...item,
      onItemClick: () => { setCardMode({ mode: 'browse', location, label }); setSearchTerm(''); },
    })),
  });

  // ─── Browse state data ────────────────────────────────────────────────────

  const browseLocation = cardMode.mode === 'browse' ? cardMode.location : null;
  const browseLabel = cardMode.mode === 'browse' ? cardMode.label : '';

  const locationItems = useMemo(() =>
    browseLocation ? items.filter(i => i.location === browseLocation) : [],
  [items, browseLocation]);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return locationItems;
    const lower = searchTerm.toLowerCase();
    return locationItems.filter(i => i.name.toLowerCase().includes(lower));
  }, [locationItems, searchTerm]);

  const categoryGroups = useMemo(() => {
    const groups = new Map<string, InventoryItem[]>();
    for (const item of filteredItems) {
      const catName = item.category?.name
        ?? (item.food_category ? item.food_category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Uncategorized');
      const existing = groups.get(catName);
      if (existing) existing.push(item);
      else groups.set(catName, [item]);
    }
    return [...groups.entries()]
      .sort((a, b) => {
        if (a[0] === 'Uncategorized') return 1;
        if (b[0] === 'Uncategorized') return -1;
        return a[0].localeCompare(b[0]);
      })
      .map(([name, catItems]) => ({ name, items: catItems }));
  }, [filteredItems]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleAdjust = useCallback(async (item: InventoryItem, delta: number) => {
    try {
      await adjustQuantity.mutateAsync({ id: item.id, adjustment: delta });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      addToast({ message: `Failed to adjust: ${detail}`, type: 'error', durationMs: 4000 });
    }
  }, [adjustQuantity, addToast]);

  const handleNameClick = useCallback((item: InventoryItem) => {
    setEditForm({
      name: item.name,
      category_id: item.category_id,
      location: item.location,
      quantity: item.quantity,
      unit: toCanonicalUnit(item.quantity_unit ?? item.unit),
      package_size: item.package_size ?? null,
      package_unit: toCanonicalUnit(item.package_unit),
      packages_count: item.packages_count ?? null,
      adjustment_step: item.adjustment_step ?? null,
      expiration_date: item.expiration_date,
      expiration_auto_filled: item.expiration_auto_filled ?? false,
      notes: item.notes,
    });
    setCardMode({ mode: 'edit', item });
  }, []);

  const handleSave = useCallback(async () => {
    if (cardMode.mode !== 'edit') return;
    const editItem = cardMode.item;
    const data: Partial<InventoryItemUpdate> = {};
    if (editForm.name !== editItem.name) data.name = editForm.name;
    if (editForm.category_id !== editItem.category_id) data.category_id = editForm.category_id;
    if (editForm.location !== editItem.location) data.location = editForm.location;
    if (editForm.quantity !== editItem.quantity) data.quantity = editForm.quantity;
    if (editForm.unit !== editItem.unit) data.unit = editForm.unit;
    if (editForm.package_size !== (editItem.package_size ?? null)) data.package_size = editForm.package_size;
    if (editForm.package_unit !== (editItem.package_unit ?? null)) data.package_unit = editForm.package_unit;
    if (editForm.packages_count !== (editItem.packages_count ?? null)) data.packages_count = editForm.packages_count;
    if (editForm.adjustment_step !== (editItem.adjustment_step ?? null)) data.adjustment_step = editForm.adjustment_step;
    if (editForm.notes !== editItem.notes) data.notes = editForm.notes;
    if (editForm.expiration_date !== editItem.expiration_date) {
      data.expiration_date = editForm.expiration_date;
      data.expiration_auto_filled = false;
    } else if (editForm.expiration_auto_filled !== (editItem.expiration_auto_filled ?? false)) {
      data.expiration_auto_filled = editForm.expiration_auto_filled;
    }
    if (data.package_size !== undefined || data.package_unit !== undefined) {
      const size = (data.package_size ?? editForm.package_size) as number | null;
      const unit = (data.package_unit ?? editForm.package_unit) as string | null;
      data.package_label = size && unit ? `${size}${unit}` : null;
    }
    if (Object.keys(data).length === 0) {
      setCardMode({ mode: 'browse', location: editItem.location, label: browseLabel || editItem.location });
      return;
    }
    try {
      await updateItem.mutateAsync({ id: editItem.id, data });
      addToast({ message: 'Item updated', type: 'success', durationMs: 3000 });
      setCardMode({ mode: 'browse', location: editItem.location, label: browseLabel || editItem.location });
    } catch {
      addToast({ message: 'Failed to save', type: 'error', durationMs: 4000 });
    }
  }, [cardMode, editForm, updateItem, addToast, browseLabel]);

  const handleOpenNext = useCallback(async () => {
    if (cardMode.mode !== 'edit') return;
    const editItem = cardMode.item;
    const currentBackups = editForm.packages_count ?? editItem.packages_count ?? 1;
    const resetQty = isLegacyScale(editItem) ? 100 : (editItem.package_size ?? 100);
    try {
      await updateItem.mutateAsync({
        id: editItem.id,
        data: { quantity: resetQty, packages_count: Math.max(0, currentBackups - 1) },
      });
      setCardMode({ mode: 'browse', location: editItem.location, label: browseLabel || editItem.location });
    } catch {
      addToast({ message: 'Failed to open next', type: 'error', durationMs: 4000 });
    }
  }, [cardMode, editForm.packages_count, updateItem, addToast, browseLabel]);

  const handleDelete = useCallback((item: InventoryItem) => {
    requestDelete(item);
    setCardMode({ mode: 'browse', location: item.location, label: browseLabel || item.location });
  }, [requestDelete, browseLabel]);

  const updateField = useCallback(<K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleBrowseBack = useCallback(() => {
    setCardMode({ mode: 'default' });
    setSearchTerm('');
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      {/* Default: hero + 3 location pill lists */}
      {cardMode.mode === 'default' && (
        <CircularCardLayout
          hero={<HeroMetric {...hero} />}
          pillZone={[
            <PillList key="pantry" {...withOverlayClick(pantry, 'pantry', 'Pantry')} />,
            <PillList key="fridge" {...withOverlayClick(fridge, 'fridge', 'Fridge')} />,
            <PillList key="freezer" {...withOverlayClick(freezer, 'freezer', 'Freezer')} />,
          ]}
        />
      )}

      {/* Browse: location items with search + adjust buttons */}
      {cardMode.mode === 'browse' && (
        <CircularCardLayout
          hero={<HeroMetric value={browseLabel} label="INVENTORY" sublabel={`${locationItems.length} item${locationItems.length !== 1 ? 's' : ''}`} color={ACCENT} />}
          formZone={
            <>
              <div style={{ flexShrink: 0, paddingLeft: '6cqi', paddingRight: '6cqi' }}>
                <FormField type="text" value={searchTerm} onChange={setSearchTerm}
                  label="Search" placeholder={`Search ${browseLabel.toLowerCase()}...`} accentColor={ACCENT} />
              </div>
              <ScrollZone paddingX="6cqi" paddingBottom="4cqi">
                {categoryGroups.map((group) => (
                  <div key={group.name} style={{ marginBottom: '1.2cqi' }}>
                    <span style={{
                      fontSize: '1.6cqi', fontWeight: 600, color: TEXT_COLORS.secondary,
                      textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: FONT_FAMILY,
                    }}>
                      {group.name} <span style={{ fontWeight: 400 }}>({group.items.length})</span>
                    </span>
                    {group.items.map((item) => (
                      <ItemRow key={item.id} item={item} onNameClick={handleNameClick}
                        onAdjust={handleAdjust} onOpenNext={async () => {
                          const resetQty = isLegacyScale(item) ? 100 : (item.package_size ?? 100);
                          try {
                            await updateItem.mutateAsync({
                              id: item.id, data: { quantity: resetQty, packages_count: Math.max(0, (item.packages_count ?? 1) - 1) },
                            });
                          } catch {
                            addToast({ message: 'Failed to open next', type: 'error', durationMs: 4000 });
                          }
                        }} />
                    ))}
                  </div>
                ))}
                {categoryGroups.length === 0 && (
                  <PillList items={[]} maxItems={1}
                    emptyMessage={searchTerm.trim() ? 'No items found' : `No items in ${browseLabel.toLowerCase()}`} />
                )}
              </ScrollZone>
              <ActionBar actions={[{ label: 'Back', variant: 'slate' as const, onClick: handleBrowseBack }]} />
            </>
          }
        />
      )}

      {/* Edit: full item edit form */}
      {cardMode.mode === 'edit' && (
        <CircularCardLayout
          hero={<HeroMetric value={cardMode.item.name} label="EDIT ITEM" color={ACCENT} />}
          formZone={
            <InventoryEditForm
              editItem={cardMode.item}
              editForm={editForm}
              categories={categories}
              updateField={updateField}
              onSave={handleSave}
              onCancel={() => setCardMode({ mode: 'browse', location: cardMode.item.location, label: browseLabel || cardMode.item.location })}
              onDelete={handleDelete}
              onOpenNext={handleOpenNext}
              isSaving={updateItem.isPending}
            />
          }
        />
      )}
    </div>
  );
}

// ─── ItemRow (local component for browse state) ─────────────────────────────

function ItemRow({
  item, onNameClick, onAdjust, onOpenNext,
}: {
  item: InventoryItem;
  onNameClick: (item: InventoryItem) => void;
  onAdjust: (item: InventoryItem, delta: number) => void;
  onOpenNext: () => void;
}) {
  const display = formatQuantity(item);
  const expDate = item.expiration_date ? new Date(item.expiration_date) : null;
  const daysLeft = expDate ? Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / 86400000)) : null;
  const showExp = daysLeft !== null && daysLeft <= 7;
  const expColor = daysLeft !== null && daysLeft <= 1 ? '#d97706' : daysLeft !== null && daysLeft <= 3 ? '#fbbf24' : '#64748b';
  const minDisabled = (item.quantity ?? 0) <= 0;
  const maxDisabled = isLegacyScale(item) && (item.quantity ?? 0) >= 100;
  const showOpenNext = (item.quantity ?? 0) <= 0 && (item.packages_count ?? 0) > 1;

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0.4cqi 0.5cqi', borderRadius: '0.8cqi', gap: '0.5cqi' }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.5)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
      <span onClick={(e) => { e.stopPropagation(); onNameClick(item); }}
        style={{ flex: 1, fontSize: '2cqi', color: '#cbd5e1', fontFamily: FONT_FAMILY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#cbd5e1'; }}>
        {item.name}
      </span>
      <span style={{ fontSize: '1.8cqi', color: TEXT_COLORS.secondary, fontFamily: FONT_FAMILY, flexShrink: 0, minWidth: '4cqi', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {display}
      </span>
      {showOpenNext && (
        <button onClick={(e) => { e.stopPropagation(); onOpenNext(); }}
          style={{ fontSize: '1.3cqi', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '99px', padding: '0.15cqi 0.6cqi', cursor: 'pointer', fontFamily: FONT_FAMILY, flexShrink: 0, whiteSpace: 'nowrap' }}>
          Open next
        </button>
      )}
      <div style={{ display: 'flex', gap: '0.3cqi', flexShrink: 0 }}>
        <button onClick={(e) => { e.stopPropagation(); onAdjust(item, -getStepSize(item)); }} disabled={minDisabled}
          style={{ width: '3.5cqi', height: '3.5cqi', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2cqi', fontFamily: FONT_FAMILY, color: '#d97706', background: 'rgba(217, 119, 6, 0.1)', border: '1px solid rgba(217, 119, 6, 0.2)', cursor: minDisabled ? 'default' : 'pointer', padding: 0, lineHeight: 1, opacity: minDisabled ? 0.3 : 1 }}>
          &minus;
        </button>
        <button onClick={(e) => { e.stopPropagation(); onAdjust(item, getStepSize(item)); }} disabled={maxDisabled}
          style={{ width: '3.5cqi', height: '3.5cqi', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2cqi', fontFamily: FONT_FAMILY, color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.2)', cursor: maxDisabled ? 'default' : 'pointer', padding: 0, lineHeight: 1, opacity: maxDisabled ? 0.3 : 1 }}>
          +
        </button>
      </div>
      {showExp && (
        <span style={{ fontSize: '1.4cqi', color: expColor, fontFamily: FONT_FAMILY, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {daysLeft === 0 ? 'today' : `${daysLeft}d`}
        </span>
      )}
    </div>
  );
}
