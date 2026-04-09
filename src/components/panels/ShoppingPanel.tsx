/**
 * ShoppingPanel Component
 *
 * Contextual panel for shopping list.
 * Built from meal plan, supports expand-to-fullscreen for "at store" mode.
 *
 * Simple view - check items off as you shop.
 */

import { useState, useEffect, useRef } from 'react';
import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { PackageSizeModal } from '@/components/shared/PackageSizeModal';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import {
  useShoppingListWeek,
  useGenerateShoppingList,
  useToggleShoppingListItem,
  useCreateShoppingListItem,
  useCompleteShoppingTrip,
  shoppingListKeys,
} from '@/hooks/useShoppingList';
import type { PackageDataItem, ShoppingListItem } from '@/api/client';
import { shoppingListApi } from '@/api/client';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import type { ShoppingPanelProps } from './types';

export function ShoppingPanel({
  weekStart,
  onClose: _onClose,
  isFullscreen,
  onToggleFullscreen,
}: ShoppingPanelProps) {
  const { data: items = [], isLoading } = useShoppingListWeek(weekStart);
  const generateList = useGenerateShoppingList();
  const toggleItem = useToggleShoppingListItem();
  const createItem = useCreateShoppingListItem();
  const completeTrip = useCompleteShoppingTrip();
  const { requestDelete } = useUndoDelete<ShoppingListItem>({
    entityLabel: 'item',
    getItemName: (item) => item.name,
    getItemId: (item) => item.id,
    listQueryKeys: [shoppingListKeys.week(weekStart)],
    deleteFn: (id) => shoppingListApi.delete(id),
  });

  const [newItemName, setNewItemName] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);
  const togglingIdsRef = useRef<Set<number>>(new Set());

  // Auto-dismiss status message after 4 seconds
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  // Statistics
  const totalItems = items.length;
  const checkedItems = items.filter((i) => i.is_checked).length;
  const progress = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  const handleGenerate = async () => {
    try {
      await generateList.mutateAsync(weekStart);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setStatusMessage({ type: 'error', text: `Failed to generate list: ${detail}` });
    }
  };

  const handleToggle = async (itemId: number) => {
    if (togglingIdsRef.current.has(itemId)) return;
    togglingIdsRef.current.add(itemId);
    try {
      await toggleItem.mutateAsync(itemId);
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to toggle item' });
    } finally {
      togglingIdsRef.current.delete(itemId);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      await createItem.mutateAsync({
        name: newItemName.trim(),
        week_start: weekStart,
        category: 'Other',
      });
      setNewItemName('');
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to add item' });
    }
  };

  // V2: Check if any checked items have package enrichment data
  const checkedItemsWithPackages = items.filter((i) => i.is_checked && i.package_display);
  const hasPackageItems = checkedItemsWithPackages.length > 0;

  // Handle "Shopping Done" - show package modal if V2 data exists, else confirm first
  const handleShoppingDone = async () => {
    if (checkedItems === 0) return;
    if (hasPackageItems) {
      setShowPackageModal(true);
    } else {
      setShowConfirmComplete(true);
    }
  };

  const handleConfirmComplete = async () => {
    setShowConfirmComplete(false);
    await completeTrip_execute();
  };

  // Execute trip completion with optional package data
  const completeTrip_execute = async (packageData?: PackageDataItem[]) => {
    if (completeTrip.isPending) return;
    setStatusMessage(null);
    setShowPackageModal(false);
    try {
      const result = await completeTrip.mutateAsync({ weekStart, packageData });
      setStatusMessage({
        type: 'success',
        text: `${result.items_transferred} item${result.items_transferred !== 1 ? 's' : ''} added to inventory`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setStatusMessage({ type: 'error', text: `Failed to complete trip: ${detail}` });
    }
  };

  // Simple view only - no smart view toggle
  const isDataLoading = isLoading;
  const hasData = totalItems > 0;

  if (isDataLoading) {
    return <PanelSkeleton />;
  }

  return (
    <div className={`flex flex-col h-full ${isFullscreen ? 'p-8' : 'p-6'}`}>
      {/* Progress Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-400">
            {checkedItems} of {totalItems} items
          </span>
          <span className="text-sm font-medium text-cyan-400">{progress}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Generate Button */}
      {!hasData && (
        <div className="text-center py-8">
          <p className="text-slate-400 mb-4">
            Your pantry is stocked! Generate a list from your meal plan or add items manually.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generateList.isPending}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {generateList.isPending ? 'Generating...' : 'Generate from Meal Plan'}
          </button>
        </div>
      )}

      {/* Shopping List */}
      {hasData && (
        <div className="flex-1 overflow-y-auto space-y-6">
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category}>
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                      item.is_checked
                        ? 'bg-slate-800/50 text-slate-500'
                        : 'bg-slate-700/50 hover:bg-slate-700 text-white'
                    }`}
                  >
                    {/* Toggle area */}
                    <button
                      onClick={() => handleToggle(item.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      {/* Checkbox */}
                      <span
                        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                          item.is_checked
                            ? 'bg-cyan-500 border-cyan-500'
                            : 'border-slate-500'
                        }`}
                      >
                        {item.is_checked && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>

                      {/* Item name */}
                      <span className={`flex-1 min-w-0 truncate ${item.is_checked ? 'line-through' : ''}`}>
                        {item.name}
                      </span>

                      {/* V2: Package display (primary) with cooking detail, or V1 cooking amount */}
                      <span className="ml-auto text-right flex-shrink-0">
                        {item.package_display ? (
                          <span className="flex flex-col items-end">
                            <span className="text-sm text-cyan-400">{item.package_display}</span>
                            {item.package_detail && (
                              <span className="text-xs text-slate-500">{item.package_detail}</span>
                            )}
                          </span>
                        ) : item.quantity ? (
                          <span className="text-sm text-slate-400">{item.quantity}</span>
                        ) : null}
                      </span>
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => requestDelete(item)}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 text-red-400/60 hover:text-red-400 rounded transition-opacity"
                      title="Remove item"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {statusMessage.text}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            {/* Shopping Done Button - transfers checked items to inventory */}
            {checkedItems > 0 && (
              <button
                onClick={handleShoppingDone}
                disabled={completeTrip.isPending}
                className="w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {completeTrip.isPending ? (
                  'Adding to inventory...'
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Shopping Done ({checkedItems} items → Inventory)
                  </>
                )}
              </button>
            )}

            {/* Regenerate Button */}
            <button
              onClick={handleGenerate}
              disabled={generateList.isPending}
              className="w-full px-4 py-2 border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 rounded-lg transition-colors disabled:opacity-50"
            >
              {generateList.isPending ? 'Regenerating...' : 'Regenerate from Meal Plan'}
            </button>
          </div>
        </div>
      )}

      {/* Add Manual Item */}
      <form onSubmit={handleAddItem} className="mt-4 pt-4 border-t border-slate-700">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
            placeholder="Add an item..."
          />
          <button
            type="submit"
            disabled={!newItemName.trim() || createItem.isPending}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>

      {/* Fullscreen Mode Actions */}
      {isFullscreen && (
        <div className="mt-6 pt-4 border-t border-slate-700 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            Shopping mode - tap items to check off
          </span>
          <button
            onClick={onToggleFullscreen}
            className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            Exit Shopping Mode
          </button>
        </div>
      )}

      {/* V2: Package Size Modal */}
      <PackageSizeModal
        isOpen={showPackageModal}
        items={items}
        onConfirm={(packageData) => completeTrip_execute(packageData)}
        onSkip={() => completeTrip_execute()}
      />

      {/* Confirmation modal for non-V2 items */}
      <ConfirmationModal
        isOpen={showConfirmComplete}
        title="Complete Shopping Trip?"
        message={`Transfer ${checkedItems} checked item${checkedItems !== 1 ? 's' : ''} to inventory?`}
        confirmLabel="Transfer to Inventory"
        confirmVariant="primary"
        onConfirm={handleConfirmComplete}
        onCancel={() => setShowConfirmComplete(false)}
        isLoading={completeTrip.isPending}
      />
    </div>
  );
}
