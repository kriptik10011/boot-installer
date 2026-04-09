/**
 * Inventory, Pantry & Depletion Types
 */

// Pantry-First Suggestions
export interface IngredientMatch {
  ingredient_id: number;
  ingredient_name: string;
  in_stock: boolean;
  stock_note?: string | null;
}

export interface PantrySuggestion {
  recipe_id: number;
  recipe_name: string;
  total_ingredients: number;
  matching_ingredients: number;
  missing_ingredients: number;
  match_pct: number;
  matches: IngredientMatch[];
  missing: IngredientMatch[];
}

// Post-cooking depletion
export interface DepletionAdjustment {
  ingredient_id: number;
  percent_used?: number;
  count_used?: number;
}

export interface DepletionLogEntry {
  ingredient_id: number;
  ingredient_name: string;
  mode: string;
  amount_depleted: number;
  remaining: number;
  status: string;
}

export interface SkippedEntry {
  ingredient_name: string;
  reason: string;
}

export interface DepletionResponse {
  depleted: DepletionLogEntry[];
  skipped: SkippedEntry[];
  undo_available_for_seconds: number;
}

export interface UndoDepletionResponse {
  restored_count: number;
  message: string;
}
