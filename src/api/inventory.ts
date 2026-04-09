/**
 * Inventory API — pantry items, shopping lists, package tracking.
 */

import { request } from './core';
import type {
  DepletionAdjustment,
  DepletionResponse,
  UndoDepletionResponse,
} from '@/types';

// =============================================================================
// INVENTORY TYPES
// =============================================================================

export type StorageLocation = 'pantry' | 'fridge' | 'freezer';
export type ItemSource = 'purchased' | 'leftover' | 'homemade' | 'gifted';

export interface FoodGroupSummary {
  protein: number;
  dairy: number;
  grains: number;
  vegetables: number;
  fruits: number;
  total_classified: number;
  total_items: number;
}

export interface InventoryCategory {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryCategoryCreate {
  name: string;
}

export interface InventoryItem {
  id: number;
  name: string;
  quantity: number;
  unit: string | null;
  category_id: number | null;
  location: StorageLocation;
  expiration_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  category?: InventoryCategory;
  purchase_date: string | null;
  default_shelf_life: number | null;
  expiration_auto_filled: boolean;
  food_category: string | null;
  source: ItemSource;
  linked_meal_id: number | null;
  original_meal_name: string | null;
  ingredient_id?: number | null;
  percent_full?: number | null;
  last_restocked_at?: string | null;
  consumption_history?: Array<{
    date: string;
    amount_used: number;
    meal_id?: number;
    package_amount_used?: number;
    days_since_restock?: number;
  }>;
  package_size?: number | null;
  package_unit?: string | null;
  package_label?: string | null;
  packages_count?: number | null;
  amount_used?: number | null;
  amount_used_unit?: string | null;
  tracking_mode?: 'count' | 'percentage';
  adjustment_step?: number | null;
  tracking_mode_override?: string | null;
  // Unified tracking fields
  unit_type?: 'discrete' | 'continuous' | null;
  quantity_unit?: string | null;
  packages_backup?: number | null;
  reorder_threshold?: number | null;
}

export interface InventoryItemCreate {
  name: string;
  quantity: number;
  unit?: string | null;
  category_id?: number | null;
  location: StorageLocation;
  expiration_date?: string | null;
  notes?: string | null;
  purchase_date?: string | null;
  source?: ItemSource;
  linked_meal_id?: number | null;
  original_meal_name?: string | null;
  // V2: Package tracking
  package_size?: number | null;
  package_unit?: string | null;
  package_label?: string | null;
  packages_count?: number | null;
  // Per-item tracking overrides
  adjustment_step?: number | null;
  tracking_mode_override?: string | null;
  // Unified tracking
  quantity_unit?: string | null;
  packages_backup?: number | null;
}

export interface InventoryItemUpdate {
  name?: string;
  quantity?: number;
  unit?: string | null;
  category_id?: number | null;
  location?: StorageLocation;
  expiration_date?: string | null;
  notes?: string | null;
  expiration_auto_filled?: boolean;
  percent_full?: number | null;
  // V2: Package tracking
  package_size?: number | null;
  package_unit?: string | null;
  package_label?: string | null;
  packages_count?: number | null;
  adjustment_step?: number | null;
  tracking_mode_override?: string | null;
  // Unified tracking
  quantity_unit?: string | null;
  packages_backup?: number | null;
}

export interface BulkCreateResponse {
  created: InventoryItem[];
  failed: { index: number; name: string; error: string }[];
  total_requested: number;
  total_created: number;
}

export interface ExpirationFeedbackCreate {
  item_id: number;
  feedback_type: 'spoiled_early' | 'lasted_longer';
  actual_days: number;
}

export interface ExpirationFeedback {
  id: number;
  item_name: string;
  food_category: string;
  storage_location: StorageLocation;
  feedback_type: string;
  expected_days: number;
  actual_days: number;
  difference_days: number;
  created_at: string;
}

export interface RecentMeal {
  id: number;
  date: string;
  meal_type: string;
  description: string | null;
  recipe_name: string | null;
  display_name: string;
}

export interface LeftoverCreate {
  meal_id: number;
  quantity?: number;
  unit?: string | null;
  location?: StorageLocation;
  notes?: string | null;
  expiration_date?: string | null;
}

// =============================================================================
// INVENTORY API
// =============================================================================

export const inventoryApi = {
  listCategories: () => request<InventoryCategory[]>('/inventory/categories'),
  createCategory: (data: InventoryCategoryCreate) =>
    request<InventoryCategory>('/inventory/categories', { method: 'POST', body: data }),
  deleteCategory: (id: number) =>
    request<void>(`/inventory/categories/${id}`, { method: 'DELETE' }),

  listItems: (location?: StorageLocation, categoryId?: number) => {
    const params = new URLSearchParams();
    if (location) params.append('location', location);
    if (categoryId) params.append('category_id', String(categoryId));
    const queryString = params.toString();
    return request<InventoryItem[]>(`/inventory/items${queryString ? `?${queryString}` : ''}`);
  },
  getItem: (id: number) => request<InventoryItem>(`/inventory/items/${id}`),
  createItem: (data: InventoryItemCreate) =>
    request<InventoryItem>('/inventory/items', { method: 'POST', body: data }),
  bulkCreateItems: (items: InventoryItemCreate[]) =>
    request<BulkCreateResponse>('/inventory/items/bulk', { method: 'POST', body: { items } }),
  updateItem: (id: number, data: InventoryItemUpdate) =>
    request<InventoryItem>(`/inventory/items/${id}`, { method: 'PUT', body: data }),
  deleteItem: (id: number) =>
    request<void>(`/inventory/items/${id}`, { method: 'DELETE' }),
  adjustQuantity: (id: number, adjustment: number) =>
    request<InventoryItem>(`/inventory/items/${id}/quantity`, {
      method: 'PATCH',
      body: { adjustment },
    }),

  getExpiring: (days: number = 7) =>
    request<InventoryItem[]>(`/inventory/items/expiring?days=${days}`),
  getLowStock: (threshold: number = 1) =>
    request<InventoryItem[]>(`/inventory/items/low-stock?threshold=${threshold}`),
  getLeftovers: (includeExpired: boolean = false) =>
    request<InventoryItem[]>(`/inventory/items/leftovers?include_expired=${includeExpired}`),
  getFoodGroupSummary: () =>
    request<FoodGroupSummary>('/inventory/items/food-group-summary'),

  recordExpirationFeedback: (itemId: number, data: Omit<ExpirationFeedbackCreate, 'item_id'>) =>
    request<ExpirationFeedback>(`/inventory/items/${itemId}/expiration-feedback`, {
      method: 'POST',
      body: { ...data, item_id: itemId },
    }),
  listExpirationFeedback: (foodCategory?: string, limit: number = 50) => {
    const params = new URLSearchParams();
    if (foodCategory) params.append('food_category', foodCategory);
    params.append('limit', String(limit));
    return request<ExpirationFeedback[]>(`/inventory/expiration-feedback?${params.toString()}`);
  },

  getRecentMeals: (days: number = 7) =>
    request<RecentMeal[]>(`/inventory/leftovers/recent-meals?days=${days}`),
  createLeftover: (data: LeftoverCreate) =>
    request<InventoryItem>('/inventory/leftovers', { method: 'POST', body: data }),

  depletFromCooking: (mealId: number, adjustments?: DepletionAdjustment[]) =>
    request<DepletionResponse>(
      `/inventory/deplete-from-cooking/${mealId}`,
      { method: 'POST', ...(adjustments ? { body: { adjustments } } : {}) }
    ),
  undoDepletion: (mealId: number) =>
    request<UndoDepletionResponse>(
      `/inventory/undo-depletion/${mealId}`,
      { method: 'POST' }
    ),
};

// =============================================================================
// SHOPPING LIST TYPES
// =============================================================================

export interface ShoppingListItem {
  id: number;
  name: string;
  quantity: string | null;
  category: string | null;
  is_checked: boolean;
  source_recipe_id: number | null;
  week_start: string;
  created_at: string;
  updated_at: string;
  ingredient_id?: number | null;
  quantity_amount?: number | null;
  quantity_unit?: string | null;
  package_display?: string | null;
  package_detail?: string | null;
  package_size?: number | null;
  package_unit?: string | null;
  package_type?: string | null;
  packages_needed?: number | null;
}

export interface ShoppingListItemCreate {
  name: string;
  quantity?: string | null;
  category?: string | null;
  week_start: string;
  source_recipe_id?: number | null;
}

export interface ShoppingListItemUpdate {
  name?: string;
  quantity?: string | null;
  category?: string | null;
  is_checked?: boolean;
}

export interface GenerateShoppingListResponse {
  items_created: number;
  recipes_processed: number;
}

export interface PackageDataItem {
  shopping_item_id: number;
  package_label: string;
  package_size: number;
  package_unit: string;
  package_type?: string | null;
  store?: string | null;
  price?: number | null;
}

export interface CompleteShoppingTripRequest {
  package_data?: PackageDataItem[] | null;
}

export interface CompleteShoppingTripResponse {
  items_transferred: number;
  items_cleared: number;
}

// =============================================================================
// SHOPPING LIST API
// =============================================================================

export const shoppingListApi = {
  getWeek: (weekStart: string) =>
    request<ShoppingListItem[]>(`/shopping-list/week/${weekStart}`),
  get: (id: number) => request<ShoppingListItem>(`/shopping-list/${id}`),
  create: (data: ShoppingListItemCreate) =>
    request<ShoppingListItem>('/shopping-list', { method: 'POST', body: data }),
  update: (id: number, data: ShoppingListItemUpdate) =>
    request<ShoppingListItem>(`/shopping-list/${id}`, { method: 'PUT', body: data }),
  toggle: (id: number) =>
    request<ShoppingListItem>(`/shopping-list/${id}/toggle`, { method: 'POST' }),
  delete: (id: number) => request<void>(`/shopping-list/${id}`, { method: 'DELETE' }),
  clearWeek: (weekStart: string) =>
    request<void>(`/shopping-list/week/${weekStart}/clear`, { method: 'DELETE' }),
  generate: (weekStart: string) =>
    request<GenerateShoppingListResponse>(`/shopping-list/generate/${weekStart}`, { method: 'POST' }),
  getCategories: () => request<string[]>('/shopping-list/categories'),
  completeTrip: (weekStart: string, body?: CompleteShoppingTripRequest) =>
    request<CompleteShoppingTripResponse>(`/shopping-list/week/${weekStart}/complete`, {
      method: 'POST',
      ...(body ? { body } : {}),
    }),
};
