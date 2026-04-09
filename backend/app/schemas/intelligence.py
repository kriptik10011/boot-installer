"""
Pydantic schemas for the intelligence API endpoints.

Schemas match the EXACT camelCase field names returned by compute_*_intelligence functions.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class RecipeIntelligenceResponse(BaseModel):
    """Response for GET /intelligence/recipes."""
    favorites: List[Dict[str, Any]]
    complexityScores: List[Dict[str, Any]]
    suggestedRecipes: List[Dict[str, Any]]
    insights: List[Dict[str, Any]]
    confidence: float
    isLearning: bool


class EventIntelligenceResponse(BaseModel):
    """Response for GET /intelligence/events."""
    dayInsights: List[Dict[str, Any]]
    totalConflicts: int
    overloadedDays: int
    conflictDays: int
    confidence: float
    isLearning: bool
    byDate: Dict[str, List[Dict[str, Any]]]
    upcoming: List[Dict[str, Any]]
    weekEventCount: int


class FinanceIntelligenceResponse(BaseModel):
    """Response for GET /intelligence/finance."""
    billInsights: List[Dict[str, Any]]
    budgetPaceInsights: List[Dict[str, Any]]
    upcomingCount: int
    overdueCount: int
    totalUpcoming: float
    confidence: float
    isLearning: bool
    all: List[Dict[str, Any]]
    byDate: Dict[str, List[Dict[str, Any]]]
    overdue: List[Dict[str, Any]]
    upcoming7d: List[Dict[str, Any]]
    upcoming14d: List[Dict[str, Any]]
    upcoming30d: List[Dict[str, Any]]


class InventoryIntelligenceResponse(BaseModel):
    """Response for GET /intelligence/inventory."""
    insights: List[Dict[str, Any]]
    health: Dict[str, Any]
    expiringCount: int
    lowStockCount: int
    leftoverCount: int
    confidence: float
    isLearning: bool
    totalQuantitySum: float
    activeItemCount: int
    locationCounts: Dict[str, int]
    categoryBreakdown: List[Dict[str, Any]]
    expiringWithDays: List[Dict[str, Any]]
    lowStockDisplay: List[Dict[str, Any]]
    foodGroupFills: Dict[str, Any]


class MealIntelligenceResponse(BaseModel):
    """Response for GET /intelligence/meals."""
    gaps: List[Dict[str, Any]]
    suggestions: List[Dict[str, Any]]
    plannedCount: int
    unplannedCount: int
    confidence: float
    isLearning: bool
    byDate: Dict[str, List[Dict[str, Any]]]
    nextMealGap: Optional[Dict[str, Any]]
    coveragePct: float
    dayFills: List[Dict[str, Any]]


class CrossFeatureIntelligenceResponse(BaseModel):
    """Response for GET /intelligence/cross-feature."""
    insights: List[Dict[str, Any]]
    weekCharacter: str
    isLearning: bool
    isLoading: bool
