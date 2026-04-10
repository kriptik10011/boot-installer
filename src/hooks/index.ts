// Events hooks
export {
  eventKeys,
  useEvents,
  useWeekEvents,
  useEvent,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
} from './useEvents';

// Categories hooks
export {
  categoryKeys,
  useEventCategories,
  useRecipeCategories,
  useFinancialCategories,
} from './useCategories';

// Backup hooks
export {
  backupKeys,
  useDatabaseInfo,
  useExportBackup,
  useRestoreBackup,
  useDeleteAllData,
} from './useBackup';

// Recipe hooks
export {
  recipeKeys,
  useRecipes,
  useRecipe,
  useCreateRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
} from './useRecipes';

// Meal hooks
export {
  mealKeys,
  useMeals,
  useWeekMeals,
  useMeal,
  useCreateMeal,
  useUpdateMeal,
  useDeleteMeal,
} from './useMeals';

// Finance hooks
export {
  financeKeys,
  useFinancialItems,
  useFinancialItem,
  useOverdueItems,
  useUpcomingFinances,
  useCreateFinancialItem,
  useUpdateFinancialItem,
  useDeleteFinancialItem,
  useMarkPaid,
} from './useFinances';

// Shopping list hooks
export {
  shoppingListKeys,
  useShoppingListWeek,
  useShoppingListItem,
  useShoppingListCategories,
  useCreateShoppingListItem,
  useUpdateShoppingListItem,
  useToggleShoppingListItem,
  useDeleteShoppingListItem,
  useClearShoppingListWeek,
  useGenerateShoppingList,
  useCompleteShoppingTrip,
} from './useShoppingList';

export type {
  ShoppingListItem,
  ShoppingListItemCreate,
  ShoppingListItemUpdate,
} from './useShoppingList';

// Notification hooks
export {
  useNotificationService,
  useNotificationPreferences,
  useSendTestNotification,
} from './useNotifications';

// Inventory hooks
export {
  inventoryKeys,
  useInventoryCategories,
  useCreateInventoryCategory,
  useDeleteInventoryCategory,
  useInventoryItems,
  useInventoryItem,
  useExpiringItems,
  useLowStockItems,
  useCreateInventoryItem,
  useBulkCreateInventoryItems,
  useUpdateInventoryItem,
  useAdjustQuantity,
  useDeleteInventoryItem,
  useDepletFromCooking,
} from './useInventory';

// Observation hooks
export { useViewTracking } from './useViewTracking';

// Pattern detection hooks
export {
  patternKeys,
  useTemporalPatterns,
  useBehavioralPatterns,
  useDayHealth,
  useWeekSummary as usePatternWeekSummary,
  useSpendingTrends,
  useMealGaps,
  useWeekPatterns,
  useInsights,
  usePatternConfidence,
  getCurrentWeekStart,
  getDayName,
  formatHour,
  getDayHealthColor,
  getSpendingTrendIndicator,
} from './usePatterns';

// Plan repair hooks
export {
  usePlanRepair,
  createRepairableItem,
} from './usePlanRepair';

export type {
  UsePlanRepairOptions,
  UsePlanRepairReturn,
  NeedsAttentionSummary,
  PlanRepairState,
} from './usePlanRepair';

// Activity tracking hooks (Fogarty signals)
export {
  useActivityTracking,
  isGoodMomentToSurface,
  getInterruptibilityDescription,
} from './useActivityTracking';

export type {
  ActivityState,
  InterruptibilityState,
  InterruptibilityReason,
} from './useActivityTracking';

// DND mode detection hooks
export {
  useDndMode,
  shouldSuppressForDnd,
} from './useDndMode';

export type { DndState } from './useDndMode';

// V2 Finance hooks
export {
  financeV2Keys,
  useBudgetStatus,
  useSafeToSpend,
  useBudgetCategories,
  useCreateBudgetCategory,
  useAllocateBudget,
  useIncomeSources,
  useCreateIncomeSource,
  useDeleteIncomeSource,
  useIncomeSummary,
  useTransactions,
  useCreateTransaction,
  useSpendingVelocity,
  useSavingsGoals,
  useSavingsProjections,
  useEmergencyFund,
  useCreateSavingsGoal,
  useDeleteSavingsGoal,
  useContributeToGoal,
  useDebtAccounts,
  useDebtSummary,
  usePayoffPlan,
  useCreateDebtAccount,
  useDeleteDebtAccount,
  useRecordDebtPayment,
  useNetWorthCurrent,
  useNetWorthTrend,
  useCashFlowForecast,
  useAssets,
  useRecurringList,
  useCreateRecurring,
  useDeleteRecurring,
  useSubscriptionSummary,
  useMarkBillPaid,
  useInvestmentAccounts,
  useInvestmentSummary,
  useCreateInvestmentHolding,
  useDeleteInvestmentHolding,
  usePortfolioAllocation,
  usePortfolioPerformance,
  useHealthScore,
  useIncomeVsExpenses,
  useSavingsRate,
} from './useFinanceV2';

// Unified Bills (one-time + recurring bridge)
export { useUnifiedBills } from './useUnifiedBills';
export type { UnifiedBill } from './useUnifiedBills';

// Pantry suggestions + weekly review
export { usePantrySuggestions } from './usePantrySuggestions';
export { useWeeklyReview } from './useWeeklyReview';

// Recipe category mutation
export { useCreateRecipeCategory } from './useCreateRecipeCategory';

// Backend health polling
export { useBackendHealth } from './useBackendHealth';
export { useBackendReady, useHasEverConnected } from './useBackendReady';

export type { BackendHealthState } from './useBackendHealth';

// V2.2 Command Palette
export { useCommandPalette } from './useCommandPalette';
export { useGlobalHotkeys } from './useGlobalHotkeys';
export { useKeyboardNavigation } from './useKeyboardNavigation';
export type { UseCommandPaletteReturn } from './useCommandPalette';

// C2: Property Management
export {
  useProperties, useProperty, useCreateProperty, useUpdateProperty, useDeleteProperty,
  useUnits, useCreateUnit, useUpdateUnit,
  useTenants, useCreateTenant, useUpdateTenant,
  useLeases, useCreateLease, useUpdateLease, useExpiringLeases, useRenewLease,
  useRentPayments, useCreateRentPayment, useUpdateRentPayment, useOverduePayments,
  usePropertyExpenses, useCreatePropertyExpense, useUpdatePropertyExpense,
  useMaintenance, useOpenMaintenance, useCreateMaintenance, useUpdateMaintenance,
  useSecurityDeposits, useCreateSecurityDeposit, useUpdateSecurityDeposit,
  useMortgages, useCreateMortgage, useUpdateMortgage,
  useRentRoll, usePropertyPNL, usePropertyMetrics, useVacancies,
  propertyKeys,
} from './useProperty';

