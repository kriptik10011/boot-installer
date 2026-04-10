/**
 * API — Public surface. Re-exports from domain files.
 *
 * Consumers can import from '@/api/client' (legacy) or '@/api' (preferred).
 * Both resolve to the same exports.
 */

// Core
export { initAuthToken, ApiError } from './core';
export type { RequestOptions } from './core';

// Events
export { eventsApi, recurrenceRuleApi, eventCategoriesApi } from './events';

// Meals + Recipes
export {
  recipesApi, mealsApi, tagsApi, dietaryRestrictionsApi,
  foodParserApi, recipeCategoriesApi,
} from './meals';
export type {
  ExtractedIngredient, ExtractedRecipe, ImportPreviewResponse, ImportConfirmRequest,
  IngredientStatus, CoverageCheckResponse,
  CookingCompleteRequest,
  RecipeTag, TagWithRecipes, TagSuggestion, TagCreate, TagUpdate,
  ParsedFoodItem, FoodParserResponse,
} from './meals';

// Finance
export {
  financesApi, budgetApi, incomeApi, transactionsApi, savingsApi,
  debtApi, netWorthApi, recurringApi, investmentsApi, reportsApi,
  predictionsApi, financialCategoriesApi,
} from './finance';
export type {
  FinancialImportItem, FinancialImportResult, FinancialImportConfirmResponse,
  DraftMealSuggestion, DraftWeekResponse, PredictedBill, SpendingVelocityInsight,
} from './finance';

// Inventory + Shopping
export { inventoryApi, shoppingListApi } from './inventory';
export type {
  StorageLocation, ItemSource,
  InventoryCategory, InventoryCategoryCreate,
  InventoryItem, InventoryItemCreate, InventoryItemUpdate,
  BulkCreateResponse,
  ExpirationFeedbackCreate, ExpirationFeedback,
  RecentMeal, LeftoverCreate,
  ShoppingListItem, ShoppingListItemCreate, ShoppingListItemUpdate,
  GenerateShoppingListResponse,
  PackageDataItem, CompleteShoppingTripRequest, CompleteShoppingTripResponse,
  FoodGroupSummary,
} from './inventory';

// Intelligence
export { patternsApi } from './intelligence';
export type {
  PlanningTime, TemporalPatterns,
  SessionAnalysis, ViewPreference, ActionFrequency, BehavioralPatterns,
  DayHealth, PatternWeekSummary, EventConflict, SpendingTrend, MealGap,
  InsightEvidence, Insight, ConfidenceScores,
  HabitStreakDisplay, HabitStreak, HabitReference, HabitsSummary, AllPatterns,
  RecurringMealPattern, IngredientRepeat, IngredientVariety,
  RestockingPrediction, LowStockMealAlert, TrackingModeSuggestion,
  CookingHistoryItem, RecipeDurationEstimate, ChefNote, RecipeTimeSuggestion, RecipeInsights,
} from './intelligence';

// Property Management
export { propertyApi } from './property';
export type {
  PropertyResponse, PropertyCreate, PropertyUpdate,
  UnitResponse, UnitCreate, UnitUpdate,
  TenantResponse, TenantCreate, TenantUpdate,
  LeaseResponse, LeaseCreate, LeaseUpdate,
  RentPaymentResponse, RentPaymentCreate, RentPaymentUpdate,
  PropertyExpenseResponse, PropertyExpenseCreate, PropertyExpenseUpdate,
  MaintenanceRequestResponse, MaintenanceRequestCreate, MaintenanceRequestUpdate,
  SecurityDepositResponse, SecurityDepositCreate, SecurityDepositUpdate,
  MortgageResponse, MortgageCreate, MortgageUpdate,
  RentRollResponse, PropertyPNLResponse, PropertyMetricsResponse, VacancyResponse,
} from './property';

// User + System
export { backupApi, weeklyReviewApi } from './user';
export type {
  DatabaseInfo, RestoreResponse, DeleteAllDataResponse,
} from './user';

// Legacy compat: categoriesApi combines event + recipe + finance categories
import { eventCategoriesApi } from './events';
import { recipeCategoriesApi } from './meals';
import { financialCategoriesApi } from './finance';

export const categoriesApi = {
  eventCategories: () => eventCategoriesApi.list(),
  recipeCategories: () => recipeCategoriesApi.list(),
  financialCategories: () => financialCategoriesApi.list(),
};
