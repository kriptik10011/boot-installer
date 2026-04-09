# Backend Tests

## Overview

This directory contains the test suite for the Weekly Review FastAPI backend.

## IMPORTANT: In-Memory Database

**Tests use a temporary in-memory SQLite database, NOT your local database.**

```python
# From conftest.py
TEST_DATABASE_URL = "sqlite:///:memory:"
```

### What This Means

| Aspect | Behavior |
|--------|----------|
| **Your data is safe** | Tests never touch `weekly_review.db` |
| **Fresh state each test** | Each test gets a clean, empty database |
| **Auto-cleanup** | Database is destroyed after each test |
| **No persistence** | Test data doesn't persist between test runs |

### Why In-Memory?

1. **Isolation** - Tests don't affect each other or production data
2. **Speed** - In-memory is faster than disk I/O
3. **Reproducibility** - Tests always start from known state

## Running Tests

```bash
# From backend/ directory
cd backend

# Activate virtual environment
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_events.py

# Run specific test
pytest tests/test_events.py::TestEventsAPI::test_create_event
```

## Test Files

| File | Coverage |
|------|----------|
| `conftest.py` | Fixtures, test database setup |
| `test_events.py` | Events CRUD operations |
| `test_finances.py` | Financial items CRUD |
| `test_meals.py` | Meal planning CRUD |
| `test_recipes.py` | Recipes CRUD |
| `test_summary.py` | Weekly summary endpoint |
| `test_health.py` | Health check endpoint |

## Potential Future Issues

If you encounter issues with tests affecting production data or vice versa, check:

1. `conftest.py` - Ensure `TEST_DATABASE_URL` is `sqlite:///:memory:`
2. `app.dependency_overrides` - Must be set in the `client` fixture
3. Database path in `app/database.py` - Should not be hardcoded to test paths

## Adding New Tests

When adding tests:
1. Use the `client` fixture for API calls (includes test DB override)
2. Use the `test_db` fixture for direct database access
3. Use sample fixtures (`sample_event`, `sample_recipe`, etc.) for test data
