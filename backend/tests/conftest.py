"""
Pytest configuration and fixtures for backend tests.
"""

import os

# MUST be set BEFORE importing app.main — guards auth DB init and logger setup.
# Without this, importing app.main opens the real auth.db file, which on Windows
# conflicts with a running backend's file handle and can kill the backend process.
os.environ["WEEKLY_REVIEW_TEST_MODE"] = "true"

import pytest  # noqa: E402
from datetime import date, timedelta  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.main import app  # noqa: E402
from app.database import Base, get_db  # noqa: E402


# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="session", autouse=True)
def _bypass_db_injection_middleware():
    """Bypass DBInjectionMiddleware for ALL tests.

    Tests provide their own DB sessions via get_db override or direct fixtures.
    The middleware's session-token validation is irrelevant in tests.

    Note: WEEKLY_REVIEW_TEST_MODE is set at the TOP of this file (before app.main
    import) so auth_database.py uses in-memory SQLite instead of the real auth.db.
    This fixture ensures the env var stays set for the full session and is cleaned
    up after.
    """
    # Already set at module level above — just ensure it persists
    os.environ["WEEKLY_REVIEW_TEST_MODE"] = "true"
    yield
    os.environ.pop("WEEKLY_REVIEW_TEST_MODE", None)


@pytest.fixture(scope="function")
def test_db():
    """Create a fresh test database for each test."""
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Create all tables
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(test_db):
    """Create a test client with the test database."""
    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    # Disable ALL rate limiters for tests to prevent 429 errors
    # Each router creates its own Limiter instance
    from app.routers import (
        recipes, meals, shopping_list, inventory,
        events, categories, tags, patterns, summary,
        observation, recurrence, finances,
        budget, income, transactions, savings, debt, net_worth,
        recurring, investments, reports, intelligence,
        property, property_maintenance, dietary_restrictions,
        calendar_import, batch_prep, day_notes,
        predictions,
    )
    for mod in [recipes, meals, shopping_list, inventory,
                events, categories, tags, patterns, summary,
                observation, recurrence, finances,
                budget, income, transactions, savings, debt, net_worth,
                recurring, investments, reports, intelligence,
                property, property_maintenance, dietary_restrictions,
                calendar_import, batch_prep, day_notes,
                predictions]:
        if hasattr(mod, 'limiter'):
            mod.limiter.enabled = False

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


# =============================================================================
# Shared Food System Factories (Phase 4 — extracted from repeated test code)
# =============================================================================

@pytest.fixture
def ingredient_factory(test_db):
    """Factory for creating Ingredient objects with canonical name."""
    def _create(name, unit=None, category=None):
        from app.models.recipe import Ingredient
        from app.services.ingredient_service import generate_canonical_name
        ing = Ingredient(name=name, canonical_name=generate_canonical_name(name))
        if category:
            ing.category = category
        test_db.add(ing)
        test_db.flush()
        return ing
    return _create


@pytest.fixture
def recipe_factory(test_db, ingredient_factory):
    """Factory for creating Recipe + RecipeIngredient objects."""
    def _create(name, servings=4, ingredients=None):
        from app.models.recipe import Recipe, RecipeIngredient
        recipe = Recipe(name=name, servings=servings, instructions="Test instructions")
        test_db.add(recipe)
        test_db.flush()
        if ingredients:
            for ing_name, (qty, unit) in ingredients.items():
                ing = ingredient_factory(ing_name, unit)
                ri = RecipeIngredient(
                    recipe_id=recipe.id,
                    ingredient_id=ing.id,
                    quantity=str(qty),
                    unit=unit,
                )
                test_db.add(ri)
        test_db.commit()
        return recipe
    return _create


@pytest.fixture
def meal_factory(test_db):
    """Factory for creating MealPlanEntry objects."""
    def _create(meal_date, meal_type, recipe_id, planned_servings=4):
        from app.models.meal import MealPlanEntry
        meal = MealPlanEntry(
            date=meal_date,
            meal_type=meal_type,
            recipe_id=recipe_id,
            planned_servings=planned_servings,
        )
        test_db.add(meal)
        test_db.commit()
        return meal
    return _create


@pytest.fixture
def sample_event():
    """Sample event data for testing."""
    return {
        "name": "Team Meeting",
        "date": str(date.today()),
        "start_time": "09:00",
        "end_time": "10:00",
        "location": "Conference Room A",
        "description": "Weekly team sync"
    }


@pytest.fixture
def sample_recipe():
    """Sample recipe data for testing."""
    return {
        "name": "Spaghetti Carbonara",
        "instructions": "1. Cook pasta. 2. Fry bacon. 3. Mix eggs and cheese. 4. Combine.",
        "prep_time_minutes": 15,
        "cook_time_minutes": 20,
        "servings": 4,
        "source": "Italian Cookbook",
        "notes": "Use fresh eggs for best results"
    }


@pytest.fixture
def sample_financial_item():
    """Sample financial item data for testing."""
    return {
        "name": "Electricity Bill",
        "amount": 150.00,
        "due_date": str(date.today() + timedelta(days=7)),
        "type": "bill",
        "notes": "Monthly electricity"
    }


@pytest.fixture
def sample_meal():
    """Sample meal plan data for testing."""
    return {
        "date": str(date.today()),
        "meal_type": "dinner",
        "description": "Homemade pasta"
    }


@pytest.fixture
def week_start():
    """Get the Monday of the current week."""
    today = date.today()
    return today - timedelta(days=today.weekday())
