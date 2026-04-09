/**
 * InventoryPanel — Orchestrator
 *
 * Owns shared state (viewMode, editingItem, search, filter) and delegates
 * rendering to sub-components. Uses undo-delete toast instead of window.confirm.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  useInventoryItems,
  useInventoryCategories,
  useCreateInventoryItem,
  useBulkCreateInventoryItems,
  useUpdateInventoryItem,
  useAdjustQuantity,
  useCreateLeftover,
  inventoryKeys,
} from '@/hooks/useInventory';
import { useCreateShoppingListItem } from '@/hooks/useShoppingList';
import { inventoryApi } from '@/api/client';
import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { useInventoryIntelligence } from '@/hooks/useInventoryIntelligence';
import { useCurrentMode } from '@/hooks/useCurrentMode';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { useToastStore } from '@/stores/toastStore';
import type { InventoryItem, StorageLocation } from '@/api/client';
import type { InventoryPanelProps } from './types';

// Sub-components
import { InventoryListView } from './inventory/InventoryListView';
import { AddItemForm, EditItemForm } from './inventory/InventoryForms';
import { BulkAddForm, TemplateListForm } from './inventory/InventoryBulkAdd';
import { AddLeftoverForm } from './inventory/InventoryLeftover';

type ViewMode = 'list' | 'add' | 'bulk' | 'edit' | 'templates' | 'leftover';

export function InventoryPanel({ onClose }: InventoryPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<number | null>(null);
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const addToast = useToastStore((s) => s.addToast);

  // Register this view visit for session tracking
  const { registerViewVisit } = useCurrentMode();
  useEffect(() => {
    registerViewVisit('inventory');
  }, [registerViewVisit]);

  // Data fetching
  const { data: items = [], isLoading } = useInventoryItems();
  const { data: categories = [] } = useInventoryCategories();
  // Intelligence integration
  const inventoryIntelligence = useInventoryIntelligence();

  // Expiring items from intelligence (7-day window filtered to 3 days)
  const expiringItems = useMemo(
    () => (inventoryIntelligence.expiringWithDays ?? []).filter(e => e.daysLeft <= 3),
    [inventoryIntelligence.expiringWithDays]
  );

  // Mutations
  const createItem = useCreateInventoryItem();
  const bulkCreate = useBulkCreateInventoryItems();
  const updateItem = useUpdateInventoryItem();
  const adjustQuantity = useAdjustQuantity();
  const createLeftover = useCreateLeftover();
  const createShoppingItem = useCreateShoppingListItem();

  // Undo-delete for inventory items
  const { requestDelete } = useUndoDelete<InventoryItem>({
    entityLabel: 'item',
    getItemName: (item) => item.name,
    getItemId: (item) => item.id,
    listQueryKeys: [inventoryKeys.items()],
    deleteFn: (id) => inventoryApi.deleteItem(id),
    invalidateKeys: [inventoryKeys.all],
  });

  // Filter and group items
  const filteredItems = useMemo(() => {
    let result = items;

    if (showExpiringOnly) {
      const expiringIds = new Set(expiringItems.map(e => e.id));
      result = result.filter(item => expiringIds.has(item.id));
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => item.name.toLowerCase().includes(query));
    }

    if (filterCategory !== null) {
      if (filterCategory === -1) {
        result = result.filter(item => item.category_id === null || item.category_id === undefined);
      } else {
        result = result.filter(item => item.category_id === filterCategory);
      }
    }

    return result;
  }, [items, searchQuery, filterCategory, showExpiringOnly, expiringItems]);

  // Group by location
  const groupedItems = useMemo(() => {
    const groups: Record<StorageLocation, InventoryItem[]> = {
      fridge: [],
      pantry: [],
      freezer: [],
    };

    filteredItems.forEach(item => {
      groups[item.location].push(item);
    });

    return groups;
  }, [filteredItems]);

  // V2: Low stock items (package tracking below 25%)
  const lowStockItems = useMemo(() => {
    return items.filter((item) => {
      if (!item.package_size || !item.package_unit) return false;
      const packageSize = item.package_size ?? 0;
      if (packageSize <= 0) return false;
      const remaining = item.quantity ?? 0;
      return remaining / packageSize < 0.25;
    });
  }, [items]);

  const isExpiringSoon = useCallback((item: InventoryItem) => {
    return expiringItems.some(e => e.id === item.id);
  }, [expiringItems]);

  const isExpired = useCallback((item: InventoryItem) => {
    if (!item.expiration_date) return false;
    return new Date(item.expiration_date) < new Date();
  }, []);

  const handleEdit = useCallback((item: InventoryItem) => {
    setEditingItem(item);
    setViewMode('edit');
  }, []);

  const handleDelete = useCallback((item: InventoryItem) => {
    requestDelete(item);
  }, [requestDelete]);

  const handleQuickAdjust = useCallback(async (item: InventoryItem, delta: number) => {
    try {
      await adjustQuantity.mutateAsync({ id: item.id, adjustment: delta });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      addToast({ message: `Failed to adjust quantity: ${detail}`, type: 'error', durationMs: 4000 });
    }
  }, [adjustQuantity, addToast]);

  const handleMarkEmpty = useCallback(async (item: InventoryItem) => {
    if ((item.quantity ?? 0) === 0) return;
    try {
      await adjustQuantity.mutateAsync({ id: item.id, adjustment: -(item.quantity ?? 0) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      addToast({ message: `Failed to mark as empty: ${detail}`, type: 'error', durationMs: 4000 });
    }
  }, [adjustQuantity, addToast]);

  const handleNameClick = useCallback((item: InventoryItem) => {
    handleEdit(item);
  }, [handleEdit]);

  const handleAddToShoppingList = useCallback(async (item: InventoryItem) => {
    try {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
      const weekStart = monday.toISOString().split('T')[0];

      await createShoppingItem.mutateAsync({
        name: item.name,
        quantity: item.package_size ? `${item.package_size} ${item.quantity_unit ?? item.unit ?? ''}`.trim() : null,
        week_start: weekStart,
      });
      addToast({ message: `${item.name} added to shopping list`, type: 'success', durationMs: 3000 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      addToast({ message: `Failed to add to shopping list: ${detail}`, type: 'error', durationMs: 4000 });
    }
  }, [createShoppingItem, addToast]);

  if (isLoading) {
    return <PanelSkeleton />;
  }

  return (
    <div className="flex flex-col h-full">
      {viewMode === 'list' && (
        <InventoryListView
          groupedItems={groupedItems}
          categories={categories}
          expiringItems={expiringItems}
          lowStockItems={lowStockItems}
          searchQuery={searchQuery}
          filterCategory={filterCategory}
          showExpiringOnly={showExpiringOnly}
          onSearchChange={setSearchQuery}
          onFilterChange={setFilterCategory}
          onToggleExpiringOnly={() => setShowExpiringOnly(prev => !prev)}
          onAdd={() => setViewMode('add')}
          onBulkAdd={() => setViewMode('bulk')}
          onQuickStart={() => setViewMode('templates')}
          onAddLeftover={() => setViewMode('leftover')}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onMarkEmpty={handleMarkEmpty}
          onQuickAdjust={handleQuickAdjust}
          onNameClick={handleNameClick}
          onAddToShoppingList={handleAddToShoppingList}
          isAdjusting={adjustQuantity.isPending}
          isExpiringSoon={isExpiringSoon}
          isExpired={isExpired}
          intelligence={inventoryIntelligence}
        />
      )}

      {viewMode === 'add' && (
        <AddItemForm
          categories={categories}
          onSave={async (data) => {
            try {
              await createItem.mutateAsync(data);
              addToast({ message: 'Item added successfully', type: 'success', durationMs: 4000 });
              setViewMode('list');
            } catch (error) {
              const detail = error instanceof Error ? error.message : 'Unknown error';
              addToast({ message: `Failed to add item: ${detail}`, type: 'error', durationMs: 4000 });
            }
          }}
          onCancel={() => setViewMode('list')}
          isPending={createItem.isPending}
        />
      )}

      {viewMode === 'bulk' && (
        <BulkAddForm
          categories={categories}
          onSave={async (newItems) => {
            try {
              const result = await bulkCreate.mutateAsync(newItems);
              const msg = result.failed.length > 0
                ? `${result.total_created} of ${result.total_requested} items added (${result.failed.length} failed)`
                : `${result.total_created} items added successfully`;
              addToast({
                message: msg,
                type: result.failed.length > 0 ? 'error' : 'success',
                durationMs: 4000,
              });
              setViewMode('list');
            } catch (error) {
              const detail = error instanceof Error ? error.message : 'Unknown error';
              addToast({ message: `Failed to add items: ${detail}`, type: 'error', durationMs: 4000 });
            }
          }}
          onCancel={() => setViewMode('list')}
          isPending={bulkCreate.isPending}
        />
      )}

      {viewMode === 'templates' && (
        <TemplateListForm
          categories={categories}
          existingItems={items}
          onSave={async (newItems) => {
            try {
              const result = await bulkCreate.mutateAsync(newItems);
              const msg = result.failed.length > 0
                ? `${result.total_created} of ${result.total_requested} items added (${result.failed.length} failed)`
                : `${result.total_created} items added successfully`;
              addToast({
                message: msg,
                type: result.failed.length > 0 ? 'error' : 'success',
                durationMs: 4000,
              });
              setViewMode('list');
            } catch (error) {
              const detail = error instanceof Error ? error.message : 'Unknown error';
              addToast({ message: `Failed to add items: ${detail}`, type: 'error', durationMs: 4000 });
            }
          }}
          onCancel={() => setViewMode('list')}
          isPending={bulkCreate.isPending}
        />
      )}

      {viewMode === 'leftover' && (
        <AddLeftoverForm
          onSave={async (data) => {
            try {
              await createLeftover.mutateAsync(data);
              addToast({ message: 'Leftover saved successfully', type: 'success', durationMs: 4000 });
              setViewMode('list');
            } catch (error) {
              const detail = error instanceof Error ? error.message : 'Unknown error';
              addToast({ message: `Failed to save leftover: ${detail}`, type: 'error', durationMs: 4000 });
            }
          }}
          onCancel={() => setViewMode('list')}
          isPending={createLeftover.isPending}
        />
      )}

      {viewMode === 'edit' && editingItem && (
        <EditItemForm
          item={editingItem}
          categories={categories}
          onSave={async (data) => {
            try {
              await updateItem.mutateAsync({ id: editingItem.id, data });
              addToast({ message: 'Item updated successfully', type: 'success', durationMs: 4000 });
              setEditingItem(null);
              setViewMode('list');
            } catch (error) {
              const detail = error instanceof Error ? error.message : 'Unknown error';
              addToast({ message: `Failed to update item: ${detail}`, type: 'error', durationMs: 4000 });
            }
          }}
          onCancel={() => {
            setEditingItem(null);
            setViewMode('list');
          }}
          isPending={updateItem.isPending}
        />
      )}

    </div>
  );
}
