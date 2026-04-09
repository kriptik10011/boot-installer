"""
SQLAlchemy models for the application database.

Unified Ingredient Architecture:
- TrackingMode: COUNT vs PERCENTAGE tracking
- IngredientCategory: Cold-start category inference
- generate_canonical_name: Normalize ingredient names for matching
- infer_category_from_name: Infer category for cold start
"""

from app.models.event import Event, EventCategory, EventTag, EventTagAssociation
from app.models.recipe import (
    Recipe, RecipeCategory, Ingredient, RecipeIngredient, RecipeTag, RecipeTagAssociation,
    TrackingMode, IngredientCategory, generate_canonical_name, infer_category_from_name
)
from app.models.financial import FinancialItem, FinancialCategory, FinancialItemType
from app.models.meal import MealPlanEntry, MealPlanTemplate
from app.models.recurrence import RecurrenceRule
from app.models.shopping_list import ShoppingListItem
from app.models.inventory import InventoryItem, InventoryCategory, StorageLocation, ItemSource
from app.models.observation import ObservationEvent, DwellTimeRecord, SessionSummary, ObservationEventType
from app.models.habit_streak import HabitStreak
from app.models.intelligence_model import IntelligenceModel
from app.models.ingredient_package import IngredientPackage, DEFAULT_PACKAGE_MAPPINGS
from app.models.package_conversion import PackageConversion, DEFAULT_PACKAGE_CONVERSIONS
from app.models.purchase_history import PurchaseHistory
from app.models.ingredient_alias import IngredientAlias, DEFAULT_ALIASES
# Finance models
from app.models.budget import BudgetCategory, BudgetAllocation, BudgetCategoryType, BudgetPeriod
from app.models.income import IncomeSource, IncomeFrequency
from app.models.transaction import Transaction
from app.models.transaction_recurrence import TransactionRecurrence, RecurrenceFrequency
from app.models.savings_goal import SavingsGoal, SavingsGoalCategory
from app.models.debt import DebtAccount, DebtPayment, DebtType, PayoffStrategy
from app.models.asset import Asset, AssetHistory, AssetType
# Investment models
from app.models.investment import (
    InvestmentAccount, InvestmentHolding, TargetAllocation, InvestmentContribution,
    InvestmentAccountType, AssetClass,
)
# Day notes and batch prep
from app.models.day_note import DayNote
from app.models.batch_prep import BatchPrepSession, BatchPrepTask, BatchPrepMeal
# Dietary restrictions
from app.models.dietary_restriction import DietaryRestriction, RecipeDietaryRestriction, DEFAULT_DIETARY_RESTRICTIONS
# Observation Learning
from app.models.observation_learning import InsightDismissal, InsightAction
# Property management
from app.models.property import (
    Property, PropertyUnit, Tenant, Lease, RentPayment, PropertyExpense,
    MaintenanceRequest, SecurityDeposit, Mortgage,
    PropertyType, LeaseStatus, RentStatus, ExpenseCategory,
    MaintenancePriority, MaintenanceStatus,
)

__all__ = [
    # Events
    "Event",
    "EventCategory",
    "EventTag",
    "EventTagAssociation",
    # Recipes & Ingredients
    "Recipe",
    "RecipeCategory",
    "Ingredient",
    "RecipeIngredient",
    "RecipeTag",
    "RecipeTagAssociation",
    # Ingredient tracking enums and helpers
    "TrackingMode",
    "IngredientCategory",
    "generate_canonical_name",
    "infer_category_from_name",
    # Financial (V1)
    "FinancialItem",
    "FinancialCategory",
    "FinancialItemType",
    # Meals
    "MealPlanEntry",
    "MealPlanTemplate",
    "RecurrenceRule",
    # Shopping & Inventory
    "ShoppingListItem",
    "InventoryItem",
    "InventoryCategory",
    "StorageLocation",
    "ItemSource",
    # Intelligence
    "ObservationEvent",
    "DwellTimeRecord",
    "SessionSummary",
    "ObservationEventType",
    "HabitStreak",
    "IntelligenceModel",
    # Legacy (will be migrated to Ingredient)
    "IngredientPackage",
    "DEFAULT_PACKAGE_MAPPINGS",
    # V2: Package conversion system
    "PackageConversion",
    "DEFAULT_PACKAGE_CONVERSIONS",
    "PurchaseHistory",
    # V2: Ingredient alias system
    "IngredientAlias",
    "DEFAULT_ALIASES",
    # Finance — Budget
    "BudgetCategory",
    "BudgetAllocation",
    "BudgetCategoryType",
    "BudgetPeriod",
    # Finance — Income
    "IncomeSource",
    "IncomeFrequency",
    # Finance — Transactions
    "Transaction",
    "TransactionRecurrence",
    "RecurrenceFrequency",
    # Finance — Savings
    "SavingsGoal",
    "SavingsGoalCategory",
    # Finance — Debt
    "DebtAccount",
    "DebtPayment",
    "DebtType",
    "PayoffStrategy",
    # Finance — Assets / Net Worth
    "Asset",
    "AssetHistory",
    "AssetType",
    # Investments
    "InvestmentAccount",
    "InvestmentHolding",
    "TargetAllocation",
    "InvestmentContribution",
    "InvestmentAccountType",
    "AssetClass",
    # Day notes and batch prep
    "DayNote",
    "BatchPrepSession",
    "BatchPrepTask",
    "BatchPrepMeal",
    # Dietary restrictions
    "DietaryRestriction",
    "RecipeDietaryRestriction",
    "DEFAULT_DIETARY_RESTRICTIONS",
    # Observation Learning
    "InsightDismissal",
    "InsightAction",
    # Property management
    "Property",
    "PropertyUnit",
    "Tenant",
    "Lease",
    "RentPayment",
    "PropertyExpense",
    "MaintenanceRequest",
    "SecurityDeposit",
    "Mortgage",
    "PropertyType",
    "LeaseStatus",
    "RentStatus",
    "ExpenseCategory",
    "MaintenancePriority",
    "MaintenanceStatus",
]
