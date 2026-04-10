# Architecture Overview

## The Big Picture

Weekly Review is a **desktop application** built with a modern multi-layer architecture. Each layer has a specific job.

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER'S DESKTOP                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                 TAURI (Rust Shell)                        │  │
│  │                                                           │  │
│  │  • Creates the native window                              │  │
│  │  • System tray icon (minimize to tray)                    │  │
│  │  • Desktop notifications                                  │  │
│  │  • Native file dialogs (backup/restore)                   │  │
│  │  • Launches FastAPI backend as sidecar                    │  │
│  │                                                           │  │
│  │  Location: src-tauri/                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            │                                    │
│              Renders       │        Launches                    │
│                            ▼                                    │
│  ┌─────────────────────────────────┐  ┌──────────────────────┐  │
│  │      REACT FRONTEND             │  │   FASTAPI BACKEND    │  │
│  │      (Runs in WebView)          │  │   (Sidecar Process)  │  │
│  │                                 │  │                      │  │
│  │  • All UI components            │  │  • REST API          │  │
│  │  • User interactions            │  │  • Business logic    │  │
│  │  • State management             │  │  • Data validation   │  │
│  │  • API calls to backend         │  │  • Database queries  │  │
│  │                                 │  │                      │  │
│  │  Location: src/                 │  │  Location: backend/  │  │
│  └─────────────────────────────────┘  └──────────────────────┘  │
│                            │                     │              │
│                            │  HTTP localhost     │              │
│                            └─────────────────────┘              │
│                                      │                          │
│                                      ▼                          │
│                         ┌────────────────────────┐              │
│                         │   SQLITE DATABASE      │              │
│                         │   weekly_review.db     │              │
│                         │                        │              │
│                         │  • All your data       │              │
│                         │  • Single file         │              │
│                         │  • Easy to backup      │              │
│                         └────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why This Architecture?

### Problem: You Need a Desktop App That...

| Requirement | Solution |
|-------------|----------|
| Runs offline | SQLite database (no internet needed) |
| Looks modern | React + Tailwind CSS |
| Feels native | Tauri (system tray, notifications) |
| Stays lightweight | Tauri (~5MB) vs Electron (~150MB) |
| Is easy to develop | Python backend (FastAPI) |
| Keeps data safe | Single .db file you control |

---

## How Data Flows

### Example: User Creates a New Event

```
Step 1: User fills form in React UI
        └── src/components/events/EventForm.tsx

Step 2: React calls API
        └── src/api/client.ts → eventsApi.create(data)

Step 3: HTTP POST to FastAPI
        └── POST http://localhost:8000/api/events

Step 4: FastAPI validates and saves
        └── backend/app/routers/events.py → create_event()

Step 5: SQLAlchemy writes to database
        └── INSERT INTO events (name, date, ...) VALUES (...)

Step 6: Response returns to React
        └── New event data with ID

Step 7: UI updates automatically
        └── TanStack Query invalidates cache, refetches
```

---

## The Four Layers Explained

### Layer 1: Tauri (The Container)

**What it does:** Wraps everything in a native desktop window.

**Think of it as:** The "frame" of your application - like a picture frame holds a picture.

**Files:**
- `src-tauri/tauri.conf.json` - Window size, app name, permissions
- `src-tauri/src/lib.rs` - System tray, notification setup
- `src-tauri/Cargo.toml` - Rust dependencies

**You'd modify Tauri if:**
- Changing window size/behavior
- Adding/removing system tray options
- Changing notification behavior
- Adding new native capabilities

---

### Layer 2: React Frontend (The UI)

**What it does:** Everything the user sees and clicks.

**Think of it as:** The "painting" inside the frame.

**Files:**
- `src/components/` - All visual components
- `src/pages/` - Main page layouts
- `src/hooks/` - Data fetching logic
- `src/stores/` - Global state (current week, lens mode)
- `src/api/client.ts` - API communication

**You'd modify React if:**
- Changing how something looks
- Adding new buttons/forms
- Changing navigation
- Adjusting the layout

---

### Layer 3: FastAPI Backend (The Brain)

**What it does:** Processes requests, enforces rules, talks to database.

**Think of it as:** The "librarian" who manages all the data.

**Files:**
- `backend/app/routers/` - API endpoints
- `backend/app/models/` - Database table definitions
- `backend/app/main.py` - App initialization

**You'd modify FastAPI if:**
- Changing business logic (e.g., "bills due within 7 days")
- Adding new data fields
- Creating new API endpoints
- Changing validation rules

---

### Layer 4: SQLite Database (The Memory)

**What it does:** Stores all your data permanently.

**Think of it as:** The "filing cabinet" that remembers everything.

**Files:**
- `weekly_review.db` - The actual database file (created at runtime)
- `backend/app/models/*.py` - Define what's in the database

**You'd modify the database if:**
- Adding new types of data
- Changing relationships between data
- Adding new fields to existing tables

---

## Communication Between Layers

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│   TAURI    │     │   REACT    │     │  FASTAPI   │     │   SQLITE   │
│            │     │            │     │            │     │            │
│ Creates    │────►│ Renders    │────►│ Processes  │────►│ Stores     │
│ Window     │     │ UI         │     │ Requests   │     │ Data       │
│            │     │            │     │            │     │            │
│            │     │ HTTP calls │     │ SQL queries│     │            │
└────────────┘     └────────────┘     └────────────┘     └────────────┘

Communication:
- Tauri → React: WebView renders React app
- React → FastAPI: HTTP requests (localhost:8000)
- FastAPI → SQLite: SQL queries via SQLAlchemy
```

---

## Key Insight: Separation of Concerns

Each layer only knows about its neighbors:

| Layer | Knows About | Doesn't Know About |
|-------|-------------|-------------------|
| Tauri | React (renders it) | FastAPI, SQLite |
| React | FastAPI (calls it) | SQLite directly |
| FastAPI | SQLite (queries it) | React components |
| SQLite | Nothing (just stores) | Any of the above |

**Why this matters:** You can change one layer without breaking others. Want to redesign the UI? React changes only. Want to change how bills are calculated? Backend changes only.
