"""Dietary restrictions router tests — CRUD, recipe linking, filtering."""


# --- CRUD ---

def test_list_restrictions(client):
    r = client.get("/api/dietary-restrictions")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_restriction(client):
    r = client.post("/api/dietary-restrictions", json={
        "name": "Nut-Free", "icon": "peanut", "description": "No tree nuts",
    })
    assert r.status_code == 201
    assert r.json()["name"] == "Nut-Free"
    assert r.json()["is_system"] is False


def test_create_duplicate_restriction(client):
    client.post("/api/dietary-restrictions", json={"name": "Vegan"})
    r = client.post("/api/dietary-restrictions", json={"name": "Vegan"})
    assert r.status_code == 409


def test_delete_restriction(client):
    rid = client.post("/api/dietary-restrictions", json={"name": "TestDiet"}).json()["id"]
    r = client.delete(f"/api/dietary-restrictions/{rid}")
    assert r.status_code == 204


def test_delete_restriction_not_found(client):
    assert client.delete("/api/dietary-restrictions/9999").status_code == 404


# --- Recipe Linking ---

def test_get_recipe_restrictions_empty(client, sample_recipe):
    recipe = client.post("/api/recipes/", json=sample_recipe).json()
    r = client.get(f"/api/dietary-restrictions/recipe/{recipe['id']}")
    assert r.status_code == 200
    assert r.json() == []


def test_update_recipe_restrictions(client, sample_recipe):
    recipe = client.post("/api/recipes/", json=sample_recipe).json()
    dr = client.post("/api/dietary-restrictions", json={"name": "Gluten-Free"}).json()
    r = client.put(f"/api/dietary-restrictions/recipe/{recipe['id']}", json={
        "restriction_ids": [dr["id"]],
    })
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "Gluten-Free"


# --- Filtering ---

def test_filter_recipes_empty(client):
    r = client.get("/api/dietary-restrictions/filter/recipes")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
