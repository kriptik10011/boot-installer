# FastAPI Layer (Backend API)

## What Is FastAPI?

FastAPI is a Python framework for building APIs. It receives requests from the React frontend, processes them, and talks to the database.

## Why FastAPI?

| Need | FastAPI Solution |
|------|------------------|
| Easy to write | Python (readable, fast development) |
| Auto-validation | Pydantic validates all data |
| Auto-documentation | Swagger UI at /docs |
| Type safety | Python type hints |
| Great ORM | SQLAlchemy integration |

---

## File Structure

```
backend/
├── requirements.txt          # Python dependencies
├── app/
│   ├── __init__.py
│   ├── main.py               # FastAPI app initialization
│   ├── database.py           # Database connection setup
│   │
│   ├── models/               # SQLAlchemy models (database tables)
│   │   ├── __init__.py       # Exports all models
│   │   ├── event.py          # Event, EventCategory
│   │   ├── recipe.py         # Recipe, RecipeCategory, Ingredient
│   │   ├── financial.py      # FinancialItem, FinancialCategory
│   │   ├── meal.py           # MealPlanEntry
│   │   ├── recurrence.py     # RecurrenceRule
│   │   └── shopping_list.py  # ShoppingListItem
│   │
│   └── routers/              # API endpoints (organized by feature)
│       ├── __init__.py
│       ├── events.py         # /api/events
│       ├── recipes.py        # /api/recipes
│       ├── finances.py       # /api/finances
│       ├── meals.py          # /api/meals
│       ├── categories.py     # /api/categories
│       ├── summary.py        # /api/summary (home dashboard)
│       ├── backup.py         # /api/backup
│       ├── search.py         # /api/search
│       ├── recurrence.py     # /api/recurrence
│       └── shopping_list.py  # /api/shopping-list
│
└── tests/                    # Pytest test files
    ├── conftest.py           # Test fixtures
    ├── test_events.py
    ├── test_recipes.py
    ├── test_finances.py
    ├── test_meals.py
    └── test_summary.py
```

---

## Key Concepts

### 1. Main App (main.py)

This initializes FastAPI and connects all the routers.

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import events, recipes, finances, meals, categories, summary

# Create database tables
Base.metadata.create_all(bind=engine)

# Initialize app
app = FastAPI(
    title="Weekly Review API",
    version="0.1.0",
)

# Allow React frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "tauri://localhost"],
    allow_methods=["*"],
)

# Connect routers
app.include_router(events.router, prefix="/api/events", tags=["Events"])
app.include_router(recipes.router, prefix="/api/recipes", tags=["Recipes"])
app.include_router(finances.router, prefix="/api/finances", tags=["Finances"])
# ... more routers
```

### 2. Routers (API Endpoints)

Each router handles one type of resource.

```python
# backend/app/routers/events.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

router = APIRouter()

# Pydantic schema (validates incoming data)
class EventCreate(BaseModel):
    name: str
    date: date
    start_time: Optional[str] = None
    location: Optional[str] = None

# Endpoint
@router.post("", status_code=201)
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    """Create a new event."""
    db_event = Event(**event.model_dump())
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event
```

### 3. Pydantic Schemas (Data Validation)

Pydantic automatically validates data. If invalid, returns 422 error.

```python
class EventCreate(BaseModel):
    name: str                       # Required
    date: date                      # Required, must be valid date
    start_time: Optional[str] = None  # Optional
    end_time: Optional[str] = None
    location: Optional[str] = None
    category_id: Optional[int] = None
```

If someone sends `{"name": ""}` or `{"date": "not-a-date"}`, FastAPI automatically rejects it.

### 4. Database Session (Dependency Injection)

Every endpoint that needs the database receives a session.

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Used in endpoints
@router.get("")
def list_events(db: Session = Depends(get_db)):
    return db.query(Event).all()
```

---

## API Endpoints Reference

### Events (`/api/events`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | List all events |
| GET | `/api/events/week/{date}` | Events for specific week |
| GET | `/api/events/{id}` | Get single event |
| POST | `/api/events` | Create event |
| PUT | `/api/events/{id}` | Update event |
| DELETE | `/api/events/{id}` | Delete event |

### Finances (`/api/finances`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finances` | List all (filters: type, is_paid) |
| GET | `/api/finances/overdue` | Unpaid past due date |
| GET | `/api/finances/upcoming?days=7` | Due within N days |
| POST | `/api/finances/{id}/mark-paid` | Mark as paid |

### Summary (`/api/summary`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/summary/week/{date}` | Week summary for home dashboard |

Returns:
```json
{
  "total_events": 5,
  "total_bills_due": 3,
  "total_bills_amount": 450.00,
  "unpaid_bills_amount": 300.00,
  "overdue_count": 1,
  "meals_planned": 15,
  "meals_unplanned": 6,
  "overloaded_days": 0
}
```

---

## Common Modifications

### Add a New Field to an Existing Resource

1. **Update the model** (`backend/app/models/event.py`):
```python
class Event(Base):
    # Existing fields...
    priority = Column(String, default="normal")  # NEW
```

2. **Update the schemas** (`backend/app/routers/events.py`):
```python
class EventCreate(BaseModel):
    # Existing fields...
    priority: Optional[str] = "normal"  # NEW

class EventResponse(EventBase):
    # Existing fields...
    priority: str  # NEW
```

3. **Recreate database** (or migrate):
```bash
# Delete old database and restart
rm weekly_review.db
uvicorn app.main:app --reload
```

### Change Business Logic

Example: Change "overdue" to mean 3+ days past due:

```python
# backend/app/routers/finances.py
@router.get("/overdue")
def get_overdue_items(db: Session = Depends(get_db)):
    # Changed: overdue = 3+ days past due
    threshold = date.today() - timedelta(days=3)
    return db.query(FinancialItem).filter(
        FinancialItem.is_paid == False,
        FinancialItem.due_date < threshold  # Changed
    ).all()
```

### Add a New Endpoint

```python
# backend/app/routers/events.py

@router.get("/today")
def get_todays_events(db: Session = Depends(get_db)):
    """Get all events for today."""
    today = date.today()
    return db.query(Event).filter(Event.date == today).all()
```

---

## Swagger UI (Auto Documentation)

FastAPI automatically generates API documentation.

```bash
# Start the server
cd backend
uvicorn app.main:app --reload

# Open in browser
http://localhost:8000/docs
```

You can test all endpoints directly from the browser!

---

## When to Modify FastAPI

| If You Want To... | Modify... |
|-------------------|-----------|
| Add a new field | `models/*.py` + `routers/*.py` |
| Change validation rules | Pydantic schemas in `routers/*.py` |
| Add new endpoint | `routers/*.py` |
| Change business logic | Endpoint function in `routers/*.py` |
| Add new resource type | New model + new router + register in `main.py` |

---

## Testing FastAPI Changes

```bash
cd backend

# Run all tests
python -m pytest tests/ -v

# Run specific test file
python -m pytest tests/test_events.py -v

# Start server for manual testing
uvicorn app.main:app --reload
# Then use Swagger UI at http://localhost:8000/docs
```
