"""
End-to-end pipeline test for inventory tracking modes.

Tests 35 real pantry items through the full lifecycle:
  Phase 1: Setup categories
  Phase 2: Bulk create all 35 items
  Phase 3: Verify creation fields (percentage & count items)
  Phase 4: Step size persistence & boundary rejection
  Phase 5: Percentage adjustments (normal, fractional, floor/ceiling clamp)
  Phase 6: Count adjustments (normal, negative rejection)
  Phase 7: Mode switch + adjustment verification
  Phase 8: Field update persistence
  Phase 9: Null handling (clear override, clear step)
"""

import pytest

# ── 35-item pantry data ──────────────────────────────────────────────────────
# Each entry: (name, quantity, unit, package_size, package_unit, expiration_date,
#              tracking_mode_override, percent_full, adjustment_step, category_name)
#
# Mode decision:
#   Single-package items (qty=1, no container unit) → percentage, percent_full=100, step=10
#   Multi-unit items (qty>1 OR container unit like "cans"/"packets") → count

PANTRY_ITEMS = [
    # ── Percentage items (single-package, tracked by fullness) ──
    ("Almonds", 1, None, 14, "oz", "2027-02-16", "percentage", 100, 10, "Pantry"),
    ("Avocado Oil", 1, None, 16, "oz", None, "percentage", 100, 10, "Pantry"),
    ("Brown Sugar", 1, None, 32, "oz", None, "percentage", 100, 10, "Pantry"),
    ("Cayenne Pepper", 1, None, 1.75, "oz", "2028-06-01", "percentage", 100, 10, "Pantry"),
    ("Corn Starch", 1, None, 16, "oz", None, "percentage", 100, 10, "Pantry"),
    ("Extra Virgin Olive Oil", 1, None, 16.9, "oz", "2027-02-01", "percentage", 100, 10, "Pantry"),
    ("Garlic Powder", 1, None, 3.12, "oz", "2028-06-01", "percentage", 100, 10, "Pantry"),
    ("Ground Cinnamon", 1, None, 2.37, "oz", "2028-06-01", "percentage", 100, 10, "Pantry"),
    ("Italian Seasoning", 1, None, 0.87, "oz", "2028-06-01", "percentage", 100, 10, "Pantry"),
    ("Onion Powder", 1, None, 2.62, "oz", "2028-06-01", "percentage", 100, 10, "Pantry"),
    ("Paprika", 1, None, 2.12, "oz", "2028-06-01", "percentage", 100, 10, "Pantry"),
    ("Peanut Butter", 1, None, 16, "oz", "2027-06-01", "percentage", 100, 10, "Pantry"),
    ("Red Pepper Flakes", 1, None, 1.5, "oz", "2028-06-01", "percentage", 100, 10, "Pantry"),
    ("Rice", 1, None, 32, "oz", None, "percentage", 100, 10, "Pantry"),
    ("Sesame Oil", 1, None, 5, "oz", "2027-06-01", "percentage", 100, 10, "Pantry"),
    ("Soy Sauce", 1, None, 10, "oz", "2027-06-01", "percentage", 100, 10, "Pantry"),
    ("Vegetable Oil", 1, None, 48, "oz", None, "percentage", 100, 10, "Pantry"),
    ("White Sugar", 1, None, 64, "oz", None, "percentage", 100, 10, "Pantry"),
    ("White Vinegar", 1, None, 64, "oz", None, "percentage", 100, 10, "Pantry"),
    ("All-Purpose Flour", 1, None, 80, "oz", None, "percentage", 100, 10, "Pantry"),
    ("Baking Powder", 1, None, 8.1, "oz", "2028-01-01", "percentage", 100, 10, "Pantry"),
    ("Baking Soda", 1, None, 16, "oz", None, "percentage", 100, 10, "Pantry"),
    ("Honey", 1, None, 16, "oz", None, "percentage", 100, 10, "Pantry"),
    ("Vanilla Extract", 1, None, 2, "oz", None, "percentage", 100, 10, "Pantry"),
    # ── Count items (multi-unit or container-based) ──
    ("Del Monte Stewed Tomatoes", 6, "can", 14.5, "oz", "2027-01-01", "count", None, None, "Pantry"),
    ("Chicken Broth", 4, "can", 14.5, "oz", "2027-06-01", "count", None, None, "Pantry"),
    ("Cream of Mushroom Soup", 3, "can", 10.5, "oz", "2027-06-01", "count", None, None, "Pantry"),
    ("Black Beans", 4, "can", 15, "oz", "2028-01-01", "count", None, None, "Pantry"),
    ("Penne Pasta", 3, "box", 16, "oz", None, "count", None, None, "Pantry"),
    ("Spaghetti Pasta", 2, "box", 16, "oz", None, "count", None, None, "Pantry"),
    ("Hot Sauce", 2, "bottle", 5, "oz", "2028-01-01", "count", None, None, "Pantry"),
    ("Tea Bags", 12, "packet", None, None, None, "count", None, None, "Pantry"),
    ("Ibuprofen", 1, "bottle", None, None, "2028-06-01", "count", None, None, "Medicine"),
    ("Tums", 1, "bottle", None, None, "2028-06-01", "count", None, None, "Medicine"),
    ("Melatonin", 1, "bottle", None, None, "2028-06-01", "count", None, None, "Medicine"),
]

# Named indices for readability
_NAME, _QTY, _UNIT, _PKG_SIZE, _PKG_UNIT, _EXP, _MODE, _PCT, _STEP, _CAT = range(10)

# Subsets
PERCENTAGE_ITEMS = [i for i in PANTRY_ITEMS if i[_MODE] == "percentage"]
COUNT_ITEMS = [i for i in PANTRY_ITEMS if i[_MODE] == "count"]


# ── Shared state across ordered tests ─────────────────────────────────────────
class State:
    """Module-level shared state for ordered test sequence."""
    pantry_cat_id: int = 0
    medicine_cat_id: int = 0
    item_ids: dict = {}     # name -> id
    item_map: dict = {}     # name -> full response dict


@pytest.fixture(scope="module")
def state():
    return State()


@pytest.fixture(scope="module")
def api(client_module):
    """Alias for the module-scoped test client."""
    return client_module


@pytest.fixture(scope="module")
def client_module(test_db_module):
    """Module-scoped test client — shares DB across all tests in this file."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database import get_db

    def override_get_db():
        try:
            yield test_db_module
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    # Disable rate limiters
    from app.routers import inventory
    if hasattr(inventory, 'limiter'):
        inventory.limiter.enabled = False

    with TestClient(app) as tc:
        yield tc

    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def test_db_module():
    """Module-scoped test DB — persists across all tests in the module."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.database import Base

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = Session()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


# =============================================================================
# Phase 1 — Setup Categories
# =============================================================================

class TestPhase1Setup:
    def test_01_ensure_categories_exist(self, api, state):
        """Create Pantry and Medicine categories."""
        for cat_name in ["Pantry", "Medicine"]:
            resp = api.post("/api/inventory/categories", json={"name": cat_name})
            assert resp.status_code == 201, f"Failed to create {cat_name}: {resp.text}"
            data = resp.json()
            if cat_name == "Pantry":
                state.pantry_cat_id = data["id"]
            else:
                state.medicine_cat_id = data["id"]

        assert state.pantry_cat_id > 0
        assert state.medicine_cat_id > 0


# =============================================================================
# Phase 2 — Bulk Create All 35 Items
# =============================================================================

class TestPhase2BulkCreate:
    def test_02_bulk_create_all_35_items(self, api, state):
        """Create all 35 items via bulk endpoint."""
        items_payload = []
        for item in PANTRY_ITEMS:
            cat_id = state.medicine_cat_id if item[_CAT] == "Medicine" else state.pantry_cat_id
            payload = {
                "name": item[_NAME],
                "quantity": item[_QTY],
                "unit": item[_UNIT],
                "category_id": cat_id,
                "location": "pantry",
                "tracking_mode_override": item[_MODE],
            }
            if item[_PKG_SIZE] is not None:
                payload["package_size"] = item[_PKG_SIZE]
            if item[_PKG_UNIT] is not None:
                payload["package_unit"] = item[_PKG_UNIT]
            if item[_EXP] is not None:
                payload["expiration_date"] = item[_EXP]
            if item[_PCT] is not None:
                payload["percent_full"] = item[_PCT]
            if item[_STEP] is not None:
                payload["adjustment_step"] = item[_STEP]
            items_payload.append(payload)

        resp = api.post("/api/inventory/items/bulk", json={"items": items_payload})
        assert resp.status_code == 201, f"Bulk create failed: {resp.text}"

        body = resp.json()
        assert body["total_created"] == 35, f"Expected 35 created, got {body['total_created']}"
        assert len(body["failed"]) == 0, f"Unexpected failures: {body['failed']}"

        # Store IDs
        for item_resp in body["created"]:
            state.item_ids[item_resp["name"]] = item_resp["id"]
            state.item_map[item_resp["name"]] = item_resp

        assert len(state.item_ids) == 35


# =============================================================================
# Phase 3 — Verify Creation Fields
# =============================================================================

class TestPhase3VerifyCreation:
    def test_03_verify_percentage_items_fields(self, api, state):
        """Each percentage item: tracking_mode=percentage, percent_full=100, step=10."""
        for item_data in PERCENTAGE_ITEMS:
            name = item_data[_NAME]
            item_id = state.item_ids[name]
            resp = api.get(f"/api/inventory/items/{item_id}")
            assert resp.status_code == 200, f"GET {name} failed: {resp.text}"

            body = resp.json()
            assert body["tracking_mode"] == "percentage", f"{name}: expected percentage, got {body['tracking_mode']}"
            assert body["percent_full"] == 100.0, f"{name}: expected 100.0, got {body['percent_full']}"
            assert body["adjustment_step"] == 10, f"{name}: expected step=10, got {body['adjustment_step']}"

            # Verify package data
            if item_data[_PKG_SIZE] is not None:
                assert body["package_size"] == item_data[_PKG_SIZE], \
                    f"{name}: package_size expected {item_data[_PKG_SIZE]}, got {body['package_size']}"
            if item_data[_PKG_UNIT] is not None:
                assert body["package_unit"] == item_data[_PKG_UNIT], \
                    f"{name}: package_unit expected {item_data[_PKG_UNIT]}, got {body['package_unit']}"

    def test_04_verify_count_items_fields(self, api, state):
        """Each count item: tracking_mode=count, quantity matches, unit matches."""
        for item_data in COUNT_ITEMS:
            name = item_data[_NAME]
            item_id = state.item_ids[name]
            resp = api.get(f"/api/inventory/items/{item_id}")
            assert resp.status_code == 200, f"GET {name} failed: {resp.text}"

            body = resp.json()
            assert body["tracking_mode"] == "count", f"{name}: expected count, got {body['tracking_mode']}"
            assert body["quantity"] == item_data[_QTY], \
                f"{name}: quantity expected {item_data[_QTY]}, got {body['quantity']}"
            if item_data[_UNIT] is not None:
                assert body["unit"] == item_data[_UNIT], \
                    f"{name}: unit expected {item_data[_UNIT]}, got {body['unit']}"


# =============================================================================
# Phase 4 — Step Size Persistence & Boundary Rejection
# =============================================================================

class TestPhase4StepSize:
    def test_05_step_size_persistence(self, api, state):
        """Various step sizes persist exactly after PUT."""
        test_steps = [0.0001, 0.1, 0.333, 5, 100]
        # Use first 5 percentage items as test subjects
        subjects = list(PERCENTAGE_ITEMS[:5])

        for item_data, step in zip(subjects, test_steps):
            name = item_data[_NAME]
            item_id = state.item_ids[name]
            resp = api.put(f"/api/inventory/items/{item_id}", json={"adjustment_step": step})
            assert resp.status_code == 200, f"PUT {name} step={step} failed: {resp.text}"

            # GET and verify exact match
            resp2 = api.get(f"/api/inventory/items/{item_id}")
            assert resp2.status_code == 200
            assert resp2.json()["adjustment_step"] == step, \
                f"{name}: step expected {step}, got {resp2.json()['adjustment_step']}"

    def test_06_step_size_boundary_rejection(self, api, state):
        """Step sizes outside [0.0001, 100] rejected with 422."""
        item_id = state.item_ids["Almonds"]

        # Too small
        resp = api.put(f"/api/inventory/items/{item_id}", json={"adjustment_step": 0.00001})
        assert resp.status_code == 422, f"Expected 422 for step=0.00001, got {resp.status_code}"

        # Too large
        resp = api.put(f"/api/inventory/items/{item_id}", json={"adjustment_step": 101})
        assert resp.status_code == 422, f"Expected 422 for step=101, got {resp.status_code}"


# =============================================================================
# Phase 5 — Percentage Adjustments
# =============================================================================

class TestPhase5PercentageAdjust:
    def test_07_percentage_adjust_normal(self, api, state):
        """Almonds: 100 - 10 = 90."""
        # Reset Almonds to 100 and step=10 first
        item_id = state.item_ids["Almonds"]
        api.put(f"/api/inventory/items/{item_id}", json={"percent_full": 100, "adjustment_step": 10})

        resp = api.patch(f"/api/inventory/items/{item_id}/quantity", json={"adjustment": -10})
        assert resp.status_code == 200
        assert resp.json()["percent_full"] == 90.0

    def test_08_percentage_adjust_fractional(self, api, state):
        """Almonds at 90: 90 - 0.333 = 89.667."""
        item_id = state.item_ids["Almonds"]
        resp = api.patch(f"/api/inventory/items/{item_id}/quantity", json={"adjustment": -0.333})
        assert resp.status_code == 200
        assert resp.json()["percent_full"] == 89.667

    def test_09_percentage_floor_clamp(self, api, state):
        """Set to 1%, adjust -5 → clamped to 0%."""
        item_id = state.item_ids["Almonds"]
        api.put(f"/api/inventory/items/{item_id}", json={"percent_full": 1})

        resp = api.patch(f"/api/inventory/items/{item_id}/quantity", json={"adjustment": -5})
        assert resp.status_code == 200
        assert resp.json()["percent_full"] == 0.0

    def test_10_percentage_ceiling_clamp(self, api, state):
        """Set to 99%, adjust +5 → clamped to 100%."""
        item_id = state.item_ids["Almonds"]
        api.put(f"/api/inventory/items/{item_id}", json={"percent_full": 99})

        resp = api.patch(f"/api/inventory/items/{item_id}/quantity", json={"adjustment": 5})
        assert resp.status_code == 200
        assert resp.json()["percent_full"] == 100.0


# =============================================================================
# Phase 6 — Count Adjustments
# =============================================================================

class TestPhase6CountAdjust:
    def test_11_count_adjust_normal(self, api, state):
        """Del Monte Stewed Tomatoes: 6 - 1 = 5."""
        item_id = state.item_ids["Del Monte Stewed Tomatoes"]
        resp = api.patch(f"/api/inventory/items/{item_id}/quantity", json={"adjustment": -1})
        assert resp.status_code == 200
        assert resp.json()["quantity"] == 5.0

    def test_12_count_negative_rejected(self, api, state):
        """Cannot go below 0 quantity — returns 400."""
        item_id = state.item_ids["Del Monte Stewed Tomatoes"]
        # Set to 0
        api.put(f"/api/inventory/items/{item_id}", json={"quantity": 0})

        resp = api.patch(f"/api/inventory/items/{item_id}/quantity", json={"adjustment": -1})
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"

        # Verify quantity unchanged
        get_resp = api.get(f"/api/inventory/items/{item_id}")
        assert get_resp.json()["quantity"] == 0.0


# =============================================================================
# Phase 7 — Mode Switch + Adjustment Verification
# =============================================================================

class TestPhase7ModeSwitch:
    def test_13_switch_count_to_percentage(self, api, state):
        """Switch a count item to percentage, verify adjustments target percent_full."""
        item_id = state.item_ids["Tea Bags"]
        resp = api.put(f"/api/inventory/items/{item_id}", json={
            "tracking_mode_override": "percentage",
            "percent_full": 100,
        })
        assert resp.status_code == 200
        assert resp.json()["tracking_mode"] == "percentage"

        # Adjust should target percent_full
        adj_resp = api.patch(f"/api/inventory/items/{item_id}/quantity", json={"adjustment": -10})
        assert adj_resp.status_code == 200
        assert adj_resp.json()["percent_full"] == 90.0

    def test_14_switch_percentage_to_count(self, api, state):
        """Switch a percentage item to count, verify adjustments target quantity."""
        item_id = state.item_ids["Rice"]
        resp = api.put(f"/api/inventory/items/{item_id}", json={
            "tracking_mode_override": "count",
            "quantity": 5,
        })
        assert resp.status_code == 200
        assert resp.json()["tracking_mode"] == "count"

        # Adjust should target quantity
        adj_resp = api.patch(f"/api/inventory/items/{item_id}/quantity", json={"adjustment": -1})
        assert adj_resp.status_code == 200
        assert adj_resp.json()["quantity"] == 4.0


# =============================================================================
# Phase 8 — Field Update Persistence
# =============================================================================

class TestPhase8FieldUpdates:
    def test_15_update_name_and_unit(self, api, state):
        """PUT name + unit change, GET, verify both changed."""
        item_id = state.item_ids["Hot Sauce"]
        resp = api.put(f"/api/inventory/items/{item_id}", json={
            "name": "Hot Sauce (Tabasco)",
            "unit": "bottle",
        })
        assert resp.status_code == 200

        get_resp = api.get(f"/api/inventory/items/{item_id}")
        body = get_resp.json()
        assert body["name"] == "Hot Sauce (Tabasco)"
        assert body["unit"] == "bottle"

    def test_16_update_package_size_resets_amount_used(self, api, state):
        """Changing package_size resets amount_used to 0."""
        item_id = state.item_ids["Peanut Butter"]
        # Set an amount_used first
        api.put(f"/api/inventory/items/{item_id}", json={"package_size": 16})
        # Now change package_size → should reset amount_used
        resp = api.put(f"/api/inventory/items/{item_id}", json={"package_size": 32})
        assert resp.status_code == 200
        body = resp.json()
        assert body["package_size"] == 32
        assert body["amount_used"] == 0.0 or body["amount_used"] is None


# =============================================================================
# Phase 9 — Null Handling
# =============================================================================

class TestPhase9NullHandling:
    def test_17_clear_override_restores_inherited(self, api, state):
        """PUT tracking_mode_override=null → tracking_mode returns to default."""
        item_id = state.item_ids["Tea Bags"]
        # Tea Bags was switched to percentage in Phase 7 — clear override
        resp = api.put(f"/api/inventory/items/{item_id}", json={
            "tracking_mode_override": None,
        })
        assert resp.status_code == 200
        body = resp.json()
        # Without override, should fall back to count (no linked ingredient → COUNT default)
        assert body["tracking_mode"] == "count"
        assert body["tracking_mode_override"] is None

    def test_18_clear_step_size(self, api, state):
        """PUT adjustment_step=null → step is null (UI applies defaults)."""
        item_id = state.item_ids["Avocado Oil"]
        # Ensure it has a step first
        api.put(f"/api/inventory/items/{item_id}", json={"adjustment_step": 5})
        verify = api.get(f"/api/inventory/items/{item_id}")
        assert verify.json()["adjustment_step"] == 5

        # Clear it
        resp = api.put(f"/api/inventory/items/{item_id}", json={"adjustment_step": None})
        assert resp.status_code == 200
        body = resp.json()
        assert body["adjustment_step"] is None
