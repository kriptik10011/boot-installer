/**
 * InventoryListView — Location-grouped inventory list
 *
 * Compact intelligence summary, search/filter toolbar, primary action,
 * sediment-sorted location-grouped item list.
 */

import { useState, useMemo } from 'react';
import { InventoryItemRow } from './InventoryItemRow';
import type { InventoryItem, InventoryCategory, StorageLocation } from '@/api/client';

const LOCATIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'freezer', label: 'Freezer' },
];

export interface InventoryListViewProps {
  groupedItems: Record<StorageLocation, InventoryItem[]>;
  categories: InventoryCategory[];
  expiringItems: ReadonlyArray<{ id: number }>;
  lowStockItems: InventoryItem[];
  searchQuery: string;
  filterCategory: number | null;
  showExpiringOnly: boolean;
  onSearchChange: (query: string) => void;
  onFilterChange: (categoryId: number | null) => void;
  onToggleExpiringOnly: () => void;
  onAdd: () => void;
  onBulkAdd: () => void;
  onQuickStart: () => void;
  onAddLeftover: () => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onMarkEmpty: (item: InventoryItem) => void;
  onQuickAdjust: (item: InventoryItem, delta: number) => void;
  onNameClick: (item: InventoryItem) => void;
  onAddToShoppingList?: (item: InventoryItem) => void;
  isAdjusting?: boolean;
  isExpiringSoon: (item: InventoryItem) => boolean;
  isExpired: (item: InventoryItem) => boolean;
  intelligence: {
    insights: Array<{
      type: string;
      itemName: string;
      message: string;
      reasoning: string;
      priority: number;
    }>;
    health: {
      score: number;
      label: string;
      reasoning: string;
    };
    isLearning: boolean;
    isLoading: boolean;
  };
}

/** Collapsible section for empty (qty=0) items — "sediment" pattern */
function SedimentSection({
  items,
  categories,
  location,
  isExpiringSoon,
  isExpired,
  onEdit,
  onDelete,
  onMarkEmpty,
  onQuickAdjust,
  onNameClick,
  isAdjusting,
}: {
  items: InventoryItem[];
  categories: InventoryCategory[];
  location: StorageLocation;
  isExpiringSoon: (item: InventoryItem) => boolean;
  isExpired: (item: InventoryItem) => boolean;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onMarkEmpty: (item: InventoryItem) => void;
  onQuickAdjust: (item: InventoryItem, delta: number) => void;
  onNameClick: (item: InventoryItem) => void;
  isAdjusting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-400 transition-colors py-1"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Empty ({items.length})
      </button>
      {expanded && (
        <div className="space-y-1 opacity-40">
          {items.map(item => (
            <InventoryItemRow
              key={item.id}
              item={item}
              categories={categories}
              location={location}
              isExpiringSoon={isExpiringSoon(item)}
              isExpired={isExpired(item)}
              onEdit={() => onEdit(item)}
              onDelete={() => onDelete(item)}
              onMarkEmpty={() => onMarkEmpty(item)}
              onQuickAdjust={(delta) => onQuickAdjust(item, delta)}
              onNameClick={() => onNameClick(item)}
              isAdjusting={isAdjusting}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function InventoryListView({
  groupedItems,
  categories,
  expiringItems,
  lowStockItems,
  searchQuery,
  filterCategory,
  showExpiringOnly,
  onSearchChange,
  onFilterChange,
  onToggleExpiringOnly,
  onAdd,
  onBulkAdd,
  onQuickStart,
  onAddLeftover,
  onEdit,
  onDelete,
  onMarkEmpty,
  onQuickAdjust,
  onNameClick,
  onAddToShoppingList,
  isExpiringSoon,
  isExpired,
  isAdjusting = false,
  intelligence,
}: InventoryListViewProps) {
  const [intelExpanded, setIntelExpanded] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [tidyUpActive, setTidyUpActive] = useState(false);
  const [tidiedItemIds, setTidiedItemIds] = useState<Set<number>>(new Set());

  const totalItems = Object.values(groupedItems).flat().length;
  const hasActiveFilter = searchQuery.length > 0 || filterCategory !== null || showExpiringOnly;

  // Sediment: sort items within each location — empty items sink to bottom
  const sedimentGrouped = useMemo(() => {
    const result: Record<StorageLocation, { stocked: InventoryItem[]; empty: InventoryItem[] }> = {
      fridge: { stocked: [], empty: [] },
      pantry: { stocked: [], empty: [] },
      freezer: { stocked: [], empty: [] },
    };
    for (const loc of ['fridge', 'pantry', 'freezer'] as StorageLocation[]) {
      const items = groupedItems[loc];
      for (const item of items) {
        if ((item.quantity ?? 0) === 0) {
          result[loc].empty.push(item);
        } else {
          result[loc].stocked.push(item);
        }
      }
    }
    return result;
  }, [groupedItems]);

  // Stale items: expired or empty across all locations
  const staleItems = useMemo(() => {
    const all = Object.values(groupedItems).flat();
    return all.filter(item =>
      (item.quantity ?? 0) === 0 || isExpired(item)
    );
  }, [groupedItems, isExpired]);

  const pendingStaleItems = staleItems.filter(item => !tidiedItemIds.has(item.id));
  const showTidyUpBanner = staleItems.length >= 3 && !tidyUpActive && !intelExpanded;

  const handleTidyItem = (itemId: number) => {
    setTidiedItemIds(prev => new Set([...prev, itemId]));
  };

  const healthColorCompact = {
    'Excellent': 'text-emerald-400',
    'Good': 'text-cyan-400',
    'Needs Attention': 'text-amber-400',
    'Critical': 'text-amber-400',
  }[intelligence.health.label] || 'text-slate-400';

  const healthLabelDisplay: Record<string, string> = {
    'Excellent': 'Excellent',
    'Good': 'Good',
    'Needs Attention': 'Needs attention',
    'Critical': 'Needs love',
  };

  const displayLabel = healthLabelDisplay[intelligence.health.label] ?? intelligence.health.label;

  return (
    <div className="flex flex-col h-full p-4 overflow-x-hidden">
      {/* Compact Intelligence Summary */}
      {!intelligence.isLoading && !intelligence.isLearning && (
        <button
          onClick={() => setIntelExpanded(!intelExpanded)}
          className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3 text-sm">
            <span className={`font-medium ${healthColorCompact}`}>
              {displayLabel} {intelligence.health.score}%
            </span>
            {(expiringItems.length > 0 || lowStockItems.length > 0) && (
              <span className="text-amber-400 text-xs">
                {[
                  expiringItems.length > 0 ? `${expiringItems.length} expiring` : '',
                  lowStockItems.length > 0 ? `${lowStockItems.length} low` : '',
                ].filter(Boolean).join(', ')}
              </span>
            )}
            <svg className={`w-3.5 h-3.5 ml-auto text-slate-500 transition-transform ${intelExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
      )}

      {/* Expanded Intelligence Details */}
      {intelExpanded && (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-slate-400 px-1">{intelligence.health.reasoning}</p>

          {intelligence.insights.length > 0 && intelligence.insights.slice(0, 2).map((insight, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm px-3 py-2 bg-slate-700/20 rounded-lg">
              <div>
                <span className="text-slate-200">{insight.message}</span>
                <p className="text-xs text-slate-400 mt-0.5">{insight.reasoning}</p>
              </div>
            </div>
          ))}

          {expiringItems.length > 0 && (
            <button
              onClick={onToggleExpiringOnly}
              className={`w-full px-3 py-2 rounded-lg transition-colors text-left text-sm ${
                showExpiringOnly
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-slate-700/20 text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              {expiringItems.length} item{expiringItems.length > 1 ? 's' : ''} expiring soon
              {showExpiringOnly && ' (filtered)'}
            </button>
          )}

          {lowStockItems.length > 0 && (
            <div className="px-3 py-2 rounded-lg bg-slate-700/20 text-sm text-cyan-400">
              Running low on {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Search + Add */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search items..."
            className="w-full px-4 py-2 pl-10 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          />
          <svg className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add
        </button>
        <div className="relative">
          <button
            onClick={() => setMoreMenuOpen(!moreMenuOpen)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-600 rounded-lg transition-colors"
            title="More actions"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
          {moreMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMoreMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-slate-700 border border-slate-600 rounded-lg shadow-xl py-1">
                <button
                  onClick={() => { onAddLeftover(); setMoreMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600 transition-colors"
                >
                  <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Save Leftover
                </button>
                <button
                  onClick={() => { onQuickStart(); setMoreMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600 transition-colors"
                >
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Quick Start
                </button>
                <button
                  onClick={() => { onBulkAdd(); setMoreMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600 transition-colors"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                  </svg>
                  Bulk Add
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Category Chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            onClick={() => onFilterChange(null)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterCategory === null
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => onFilterChange(filterCategory === cat.id ? null : cat.id)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterCategory === cat.id
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {cat.name}
            </button>
          ))}
          <button
            onClick={() => onFilterChange(filterCategory === -1 ? null : -1)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterCategory === -1
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Uncategorized
          </button>
        </div>
      )}

      {/* Tidy Up Banner */}
      {showTidyUpBanner && (
        <button
          onClick={() => { setTidyUpActive(true); setTidiedItemIds(new Set()); }}
          className="w-full mb-3 px-3 py-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 transition-colors text-left flex items-center gap-3"
        >
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <div>
            <span className="text-sm font-medium text-amber-300">Tidy up</span>
            <span className="text-xs text-slate-400 ml-2">
              {staleItems.length} items need attention
            </span>
          </div>
          <svg className="w-4 h-4 text-slate-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Items List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-6">
        {/* Tidy Up Triage Flow */}
        {tidyUpActive ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-medium text-slate-200">
                  Tidy up your kitchen
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {pendingStaleItems.length > 0
                    ? `${pendingStaleItems.length} item${pendingStaleItems.length > 1 ? 's' : ''} to review`
                    : 'All done!'
                  }
                </p>
              </div>
              <button
                onClick={() => { setTidyUpActive(false); setTidiedItemIds(new Set()); }}
                className="px-3 py-1.5 text-sm text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>

            {pendingStaleItems.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-10 h-10 mx-auto mb-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-slate-300">Kitchen is tidy!</p>
                <button
                  onClick={() => { setTidyUpActive(false); setTidiedItemIds(new Set()); }}
                  className="mt-3 text-sm text-cyan-400 hover:text-cyan-300"
                >
                  Back to inventory
                </button>
              </div>
            ) : (
              pendingStaleItems.map(item => {
                const empty = (item.quantity ?? 0) === 0;
                const expired = isExpired(item);
                const statusLabel = empty && expired
                  ? 'Empty + expired'
                  : empty ? 'Empty' : 'Check freshness';

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2.5 bg-slate-700/30 rounded-lg border border-slate-600/30"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-white truncate block">{item.name}</span>
                      <span className="text-xs text-amber-400">{statusLabel}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleTidyItem(item.id)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-600/50 hover:bg-slate-600 rounded-md transition-colors"
                        title="Keep this item as-is"
                      >
                        Keep
                      </button>
                      <button
                        onClick={() => { onDelete(item); handleTidyItem(item.id); }}
                        className="px-2.5 py-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded-md transition-colors"
                        title="Remove from inventory"
                      >
                        Remove
                      </button>
                      {onAddToShoppingList && (
                        <button
                          onClick={() => { onAddToShoppingList(item); onDelete(item); handleTidyItem(item.id); }}
                          className="px-2.5 py-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-md transition-colors"
                          title="Add to shopping list and remove"
                        >
                          Restock
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : totalItems === 0 && !hasActiveFilter ? (
          <div className="text-center py-12">
            <svg className="w-14 h-14 mx-auto mb-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-slate-300 font-medium mb-1">Your kitchen is ready for groceries!</p>
            <p className="text-sm text-slate-400 mb-4">Add your first item to start tracking what you have</p>
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-dashed border-cyan-500/40 hover:border-cyan-500 text-cyan-400 hover:text-cyan-300 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add your first item
            </button>
          </div>
        ) : totalItems === 0 && hasActiveFilter ? (
          <div className="text-center py-12 text-slate-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p>No items match your filter</p>
            <p className="text-sm mt-1">Try adjusting your search or category filter</p>
            <button
              onClick={() => {
                onSearchChange('');
                onFilterChange(null);
                if (showExpiringOnly) onToggleExpiringOnly();
              }}
              className="mt-3 text-sm text-cyan-400 hover:text-cyan-300"
            >
              Clear filters
            </button>
          </div>
        ) : (
          LOCATIONS.map(({ value: location, label }) => {
            const { stocked, empty } = sedimentGrouped[location];
            if (stocked.length === 0 && empty.length === 0) return null;

            return (
              <div key={location}>
                <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  {label}
                  <span className="text-slate-600">({stocked.length + empty.length})</span>
                </h3>
                <div className="space-y-1">
                  {stocked.map(item => (
                    <InventoryItemRow
                      key={item.id}
                      item={item}
                      categories={categories}
                      location={location}
                      isExpiringSoon={isExpiringSoon(item)}
                      isExpired={isExpired(item)}
                      onEdit={() => onEdit(item)}
                      onDelete={() => onDelete(item)}
                      onMarkEmpty={() => onMarkEmpty(item)}
                      onQuickAdjust={(delta) => onQuickAdjust(item, delta)}
                      onNameClick={() => onNameClick(item)}
                      isAdjusting={isAdjusting}
                    />
                  ))}
                  {empty.length > 0 && (
                    <SedimentSection
                      items={empty}
                      categories={categories}
                      location={location}
                      isExpiringSoon={isExpiringSoon}
                      isExpired={isExpired}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onMarkEmpty={onMarkEmpty}
                      onQuickAdjust={onQuickAdjust}
                      onNameClick={onNameClick}
                      isAdjusting={isAdjusting}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
