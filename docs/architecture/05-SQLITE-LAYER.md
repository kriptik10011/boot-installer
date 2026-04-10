# SQLite Layer (Database)

## What Is SQLite?

SQLite is a database stored in a single file. Unlike MySQL or PostgreSQL, it doesn't require a server - it's just a file on disk.

## Why SQLite?

| Need | SQLite Solution |
|------|-----------------|
| No server setup | Just a file |
| Easy backup | Copy the file |
| Portable | Move file anywhere |
| Reliable | ACID compliant |
| Fast enough | Single user, local access |

---

## Database File

```
weekly_review.db    # Created in backend/ folder at runtime
```

This single file contains ALL your data:
- Events
- Recipes
- Financial items
- Meal plans
- Categories
- Recurrence rules

**To backup:** Copy this file.
**To restore:** Replace this file.

---

## Database Schema (Tables)

The database structure is defined in `backend/app/models/`.

### Events

```
┌─────────────────────────────────────────────┐
│ events                                       │
├─────────────────────────────────────────────┤
│ id              INTEGER PRIMARY KEY         │
│ name            VARCHAR NOT NULL            │
│ date            DATE NOT NULL               │
│ start_time      VARCHAR                     │
│ end_time        VARCHAR                     │
│ location        VARCHAR                     │
│ description     TEXT                        │
│ category_id     INTEGER → event_categories  │
│ recurrence_rule_id INTEGER → recurrence_rules│
│ created_at      DATETIME                    │
│ updated_at      DATETIME                    │
└─────────────────────────────────────────────┘
```

### Recipes

```
┌─────────────────────────────────────────────┐
│ recipes                                      │
├─────────────────────────────────────────────┤
│ id              INTEGER PRIMARY KEY         │
│ name            VARCHAR NOT NULL            │
│ instructions    TEXT NOT NULL               │
│ prep_time_minutes INTEGER                   │
│ cook_time_minutes INTEGER                   │
│ servings        INTEGER                     │
│ source          VARCHAR                     │
│ notes           TEXT                        │
│ category_id     INTEGER → recipe_categories │
│ created_at      DATETIME                    │
│ updated_at      DATETIME                    │
└─────────────────────────────────────────────┘
```

### Financial Items

```
┌─────────────────────────────────────────────┐
│ financial_items                              │
├─────────────────────────────────────────────┤
│ id              INTEGER PRIMARY KEY         │
│ name            VARCHAR NOT NULL            │
│ amount          FLOAT NOT NULL              │
│ due_date        DATE NOT NULL               │
│ type            VARCHAR (bill/income)       │
│ is_paid         BOOLEAN DEFAULT FALSE       │
│ paid_date       DATE                        │
│ notes           TEXT                        │
│ category_id     INTEGER → financial_categories│
│ recurrence_rule_id INTEGER → recurrence_rules│
│ created_at      DATETIME                    │
│ updated_at      DATETIME                    │
└─────────────────────────────────────────────┘
```

### Meal Plan Entries

```
┌─────────────────────────────────────────────┐
│ meal_plan_entries                            │
├─────────────────────────────────────────────┤
│ id              INTEGER PRIMARY KEY         │
│ date            DATE NOT NULL               │
│ meal_type       VARCHAR (breakfast/lunch/dinner)│
│ recipe_id       INTEGER → recipes           │
│ description     VARCHAR                     │
│ created_at      DATETIME                    │
│ updated_at      DATETIME                    │
└─────────────────────────────────────────────┘
```

### Category Tables

```
event_categories     { id, name, created_at, updated_at }
recipe_categories    { id, name, created_at, updated_at }
financial_categories { id, name, created_at, updated_at }
```

### Recurrence Rules

```
┌─────────────────────────────────────────────┐
│ recurrence_rules                             │
├─────────────────────────────────────────────┤
│ id              INTEGER PRIMARY KEY         │
│ frequency       VARCHAR (daily/weekly/monthly/yearly)│
│ interval        INTEGER DEFAULT 1           │
│ day_of_week     INTEGER (0-6, Mon-Sun)      │
│ day_of_month    INTEGER (1-31)              │
│ end_type        VARCHAR (never/count/date)  │
│ end_count       INTEGER                     │
│ end_date        DATE                        │
│ created_at      DATETIME                    │
│ updated_at      DATETIME                    │
└─────────────────────────────────────────────┘
```

---

## SQLAlchemy Models

SQLAlchemy translates Python classes into database tables.

```python
# backend/app/models/event.py
from sqlalchemy import Column, Integer, String, Date, ForeignKey, DateTime
from app.database import Base

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    start_time = Column(String)
    end_time = Column(String)
    location = Column(String)
    description = Column(String)
    category_id = Column(Integer, ForeignKey("event_categories.id"))
    recurrence_rule_id = Column(Integer, ForeignKey("recurrence_rules.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

## Relationships

```
┌──────────────┐      ┌──────────────────┐
│ event_       │◄────┐│ events           │
│ categories   │     ││                  │
└──────────────┘     │└──────────────────┘
                     │
┌──────────────┐     │┌──────────────────┐
│ recurrence_  │◄────┼│ financial_items  │
│ rules        │     │└──────────────────┘
└──────────────┘     │
                     │┌──────────────────┐
                     └│ (more tables...) │
                      └──────────────────┘

Legend:
  ◄──── = Foreign Key relationship
  One category can have many events
  One recurrence rule can apply to many events/bills
```

---

## Common Database Operations

### View Database Contents (Command Line)

```bash
cd backend
sqlite3 weekly_review.db

# List tables
.tables

# View table structure
.schema events

# Query data
SELECT * FROM events;
SELECT * FROM financial_items WHERE is_paid = 0;

# Exit
.quit
```

### Backup Database

```bash
# Simple copy
cp weekly_review.db weekly_review_backup_2026-01-27.db

# Or use the app's backup feature (Settings → Export)
```

### Reset Database (Delete All Data)

```bash
cd backend
rm weekly_review.db
# Restart the server - tables will be recreated empty
uvicorn app.main:app --reload
```

---

## Common Modifications

### Add a New Column to Existing Table

1. **Update the model** (`backend/app/models/event.py`):
```python
class Event(Base):
    # ... existing columns
    priority = Column(String, default="normal")  # NEW
```

2. **Option A: Delete and recreate** (loses data):
```bash
rm weekly_review.db
uvicorn app.main:app --reload
```

3. **Option B: Manual migration** (keeps data):
```bash
sqlite3 weekly_review.db
ALTER TABLE events ADD COLUMN priority VARCHAR DEFAULT 'normal';
.quit
```

### Add a New Table

1. **Create new model file** (`backend/app/models/notes.py`):
```python
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base

class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True)
    content = Column(String, nullable=False)
    created_at = Column(DateTime)
```

2. **Export in `__init__.py`**:
```python
# backend/app/models/__init__.py
from app.models.notes import Note
```

3. **Restart server** (table auto-created).

---

## When to Modify Database

| If You Want To... | Modify... |
|-------------------|-----------|
| Add new field | `models/*.py` + migrate/recreate |
| Add new table | New model file + `__init__.py` |
| Change field type | Model + migrate (complex) |
| Add relationship | ForeignKey in model |
| View raw data | `sqlite3` command line |
| Backup | Copy `.db` file |

---

## Data Integrity

SQLite enforces:
- **NOT NULL** - Required fields must have values
- **Foreign Keys** - category_id must exist in categories table
- **Unique constraints** - No duplicate primary keys

If you try to insert invalid data, the database rejects it.
