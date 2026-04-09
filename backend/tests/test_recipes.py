"""
Tests for Recipes API endpoints.
"""

import pytest


class TestRecipesAPI:
    """Test Recipes CRUD operations."""

    def test_list_recipes_empty(self, client):
        """Test listing recipes when none exist."""
        response = client.get("/api/recipes")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_recipe(self, client, sample_recipe):
        """Test creating a new recipe."""
        response = client.post("/api/recipes", json=sample_recipe)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == sample_recipe["name"]
        assert data["instructions"] == sample_recipe["instructions"]
        assert data["prep_time_minutes"] == sample_recipe["prep_time_minutes"]
        assert data["servings"] == sample_recipe["servings"]
        assert "id" in data

    def test_list_recipes_after_create(self, client, sample_recipe):
        """Test listing recipes after creating one."""
        client.post("/api/recipes", json=sample_recipe)
        response = client.get("/api/recipes")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == sample_recipe["name"]

    def test_get_recipe_by_id(self, client, sample_recipe):
        """Test getting a single recipe by ID."""
        create_response = client.post("/api/recipes", json=sample_recipe)
        recipe_id = create_response.json()["id"]

        response = client.get(f"/api/recipes/{recipe_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == recipe_id
        assert data["name"] == sample_recipe["name"]

    def test_get_recipe_not_found(self, client):
        """Test getting a non-existent recipe."""
        response = client.get("/api/recipes/9999")
        assert response.status_code == 404

    def test_update_recipe(self, client, sample_recipe):
        """Test updating a recipe."""
        create_response = client.post("/api/recipes", json=sample_recipe)
        recipe_id = create_response.json()["id"]

        update_data = {"name": "Updated Pasta", "servings": 6}
        response = client.put(f"/api/recipes/{recipe_id}", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Pasta"
        assert data["servings"] == 6
        # Other fields unchanged
        assert data["instructions"] == sample_recipe["instructions"]

    def test_update_recipe_not_found(self, client):
        """Test updating a non-existent recipe."""
        response = client.put("/api/recipes/9999", json={"name": "Test"})
        assert response.status_code == 404

    def test_delete_recipe(self, client, sample_recipe):
        """Test deleting a recipe."""
        create_response = client.post("/api/recipes", json=sample_recipe)
        recipe_id = create_response.json()["id"]

        response = client.delete(f"/api/recipes/{recipe_id}")
        assert response.status_code == 204

        # Verify deleted
        get_response = client.get(f"/api/recipes/{recipe_id}")
        assert get_response.status_code == 404

    def test_delete_recipe_not_found(self, client):
        """Test deleting a non-existent recipe."""
        response = client.delete("/api/recipes/9999")
        assert response.status_code == 404

    def test_search_recipes(self, client, sample_recipe):
        """Test searching recipes by name."""
        client.post("/api/recipes", json=sample_recipe)
        client.post("/api/recipes", json={
            **sample_recipe,
            "name": "Chicken Alfredo"
        })

        response = client.get("/api/recipes?search=carbonara")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert "carbonara" in data[0]["name"].lower()

    def test_filter_recipes_by_category(self, client, sample_recipe):
        """Test filtering recipes by category."""
        recipe1 = {**sample_recipe, "category_id": 1}
        recipe2 = {**sample_recipe, "name": "Other Dish", "category_id": 2}

        client.post("/api/recipes", json=recipe1)
        client.post("/api/recipes", json=recipe2)

        response = client.get("/api/recipes?category_id=1")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["category_id"] == 1
