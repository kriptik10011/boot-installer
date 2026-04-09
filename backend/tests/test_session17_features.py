"""
V2 Session 17 Tests: Data Visualization + Dietary Restrictions

Tests cover:
- Dietary restriction CRUD
- Recipe dietary tagging
- Recipe filtering by restrictions
- Visualization data endpoints (cooking freq, meal types, ingredient diversity, etc.)
"""

import pytest
from datetime import date, datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db
from app.models.dietary_restriction import DietaryRestriction, RecipeDietaryRestriction
from app.models.recipe import Recipe, RecipeCategory


@pytest.fixture(autouse=True)
def db():
    """Create a fresh in-memory database for each test."""
    _engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=_engine)
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    session = _SessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def client(db):
    """Test client with DB override."""
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# --- Dietary Restrictions Tests ---

class TestDietaryRestrictions:
    """Tests for dietary restriction CRUD."""

    def test_list_restrictions_empty(self, client, db):
        resp = client.get("/api/dietary-restrictions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_restriction(self, client, db):
        resp = client.post("/api/dietary-restrictions", json={
            "name": "Low-Sodium",
            "icon": "salt-off",
            "description": "Reduced sodium content",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Low-Sodium"
        assert data["icon"] == "salt-off"
        assert data["is_system"] is False

    def test_duplicate_restriction_rejected(self, client, db):
        client.post("/api/dietary-restrictions", json={"name": "Vegan"})
        resp = client.post("/api/dietary-restrictions", json={"name": "Vegan"})
        assert resp.status_code == 409

    def test_delete_custom_restriction(self, client, db):
        create_resp = client.post("/api/dietary-restrictions", json={"name": "TestDiet"})
        rid = create_resp.json()["id"]
        resp = client.delete(f"/api/dietary-restrictions/{rid}")
        assert resp.status_code == 204

    def test_delete_system_restriction_blocked(self, client, db):
        # Create a system restriction directly
        r = DietaryRestriction(name="SystemRestriction", is_system=True)
        db.add(r)
        db.commit()
        db.refresh(r)

        resp = client.delete(f"/api/dietary-restrictions/{r.id}")
        assert resp.status_code == 400
        assert "system" in resp.json()["detail"].lower()


class TestRecipeDietaryTagging:
    """Tests for tagging recipes with dietary restrictions."""

    def _create_recipe_and_restrictions(self, db):
        """Helper to create test data."""
        cat = RecipeCategory(name="Main")
        db.add(cat)
        db.flush()

        recipe = Recipe(name="Veggie Stir Fry", instructions="Cook veggies", category_id=cat.id)
        db.add(recipe)
        db.flush()

        r1 = DietaryRestriction(name="Vegan", is_system=True)
        r2 = DietaryRestriction(name="Gluten-Free", is_system=True)
        r3 = DietaryRestriction(name="Nut-Free", is_system=True)
        db.add_all([r1, r2, r3])
        db.commit()
        db.refresh(recipe)
        db.refresh(r1)
        db.refresh(r2)
        db.refresh(r3)
        return recipe, r1, r2, r3

    def test_get_recipe_restrictions_empty(self, client, db):
        recipe, r1, r2, r3 = self._create_recipe_and_restrictions(db)
        resp = client.get(f"/api/dietary-restrictions/recipe/{recipe.id}")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_set_recipe_restrictions(self, client, db):
        recipe, r1, r2, r3 = self._create_recipe_and_restrictions(db)
        resp = client.put(f"/api/dietary-restrictions/recipe/{recipe.id}", json={
            "restriction_ids": [r1.id, r2.id]
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        names = {d["name"] for d in data}
        assert "Vegan" in names
        assert "Gluten-Free" in names

    def test_replace_recipe_restrictions(self, client, db):
        recipe, r1, r2, r3 = self._create_recipe_and_restrictions(db)
        # First set
        client.put(f"/api/dietary-restrictions/recipe/{recipe.id}", json={
            "restriction_ids": [r1.id, r2.id]
        })
        # Replace with different set
        resp = client.put(f"/api/dietary-restrictions/recipe/{recipe.id}", json={
            "restriction_ids": [r3.id]
        })
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Nut-Free"


class TestRecipeFiltering:
    """Tests for filtering recipes by dietary restrictions."""

    def _setup_filter_data(self, db):
        """Create recipes with various restrictions for filtering."""
        cat = RecipeCategory(name="Main")
        db.add(cat)
        db.flush()

        # Recipes
        salad = Recipe(name="Green Salad", instructions="Mix greens", category_id=cat.id)
        pasta = Recipe(name="Pasta Primavera", instructions="Cook pasta", category_id=cat.id)
        steak = Recipe(name="Grilled Steak", instructions="Grill meat", category_id=cat.id)
        db.add_all([salad, pasta, steak])
        db.flush()

        # Restrictions
        vegan = DietaryRestriction(name="Vegan", is_system=True)
        gf = DietaryRestriction(name="Gluten-Free", is_system=True)
        db.add_all([vegan, gf])
        db.commit()

        # Tag: salad is vegan + gluten-free, pasta is vegan only
        db.add(RecipeDietaryRestriction(recipe_id=salad.id, restriction_id=vegan.id))
        db.add(RecipeDietaryRestriction(recipe_id=salad.id, restriction_id=gf.id))
        db.add(RecipeDietaryRestriction(recipe_id=pasta.id, restriction_id=vegan.id))
        db.commit()

        return salad, pasta, steak, vegan, gf

    def test_filter_match_all(self, client, db):
        salad, pasta, steak, vegan, gf = self._setup_filter_data(db)
        # Both vegan AND gluten-free → only salad
        resp = client.get(f"/api/dietary-restrictions/filter/recipes?restriction_ids={vegan.id},{gf.id}&match_all=true")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["recipe_name"] == "Green Salad"

    def test_filter_match_any(self, client, db):
        salad, pasta, steak, vegan, gf = self._setup_filter_data(db)
        # Vegan OR gluten-free → salad + pasta
        resp = client.get(f"/api/dietary-restrictions/filter/recipes?restriction_ids={vegan.id},{gf.id}&match_all=false")
        assert resp.status_code == 200
        data = resp.json()
        names = {d["recipe_name"] for d in data}
        assert "Green Salad" in names
        assert "Pasta Primavera" in names
        assert "Grilled Steak" not in names

    def test_filter_no_restrictions_returns_all(self, client, db):
        salad, pasta, steak, vegan, gf = self._setup_filter_data(db)
        resp = client.get("/api/dietary-restrictions/filter/recipes")
        assert resp.status_code == 200
        assert len(resp.json()) == 3


# Visualization tests removed in Phase F1 (router deleted — zero frontend consumers)
