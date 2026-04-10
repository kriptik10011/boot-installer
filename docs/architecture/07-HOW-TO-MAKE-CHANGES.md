# How to Make Changes

This guide helps you identify **which layer** to modify based on what you want to change.

---

## Decision Tree

```
What do you want to change?
│
├─► How something LOOKS (color, size, layout)
│   └─► React Layer (src/components/)
│
├─► What DATA is stored (new fields, new tables)
│   └─► Database Layer (backend/app/models/)
│       + API Layer (backend/app/routers/)
│       + React Layer (if showing new data)
│
├─► How DATA is calculated (business logic)
│   └─► API Layer (backend/app/routers/)
│
├─► Desktop features (window, tray, notifications)
│   └─► Tauri Layer (src-tauri/)
│
└─► Navigation or page structure
    └─► React Layer (src/App.tsx, src/pages/)
```

---

## Common Scenarios

### Scenario 1: "I want to change how events look"

**Layer:** React only

**Files to modify:**
- `src/components/events/EventsList.tsx` - List view
- `src/components/events/EventsCalendar.tsx` - Calendar view
- `src/components/events/EventItem.tsx` - Individual event card

**Example change:** Make event cards bigger
```tsx
// Before
<div className="p-3 rounded">

// After
<div className="p-5 rounded-lg">
```

---

### Scenario 2: "I want to add a 'priority' field to events"

**Layers:** Database + API + React

**Step 1: Database model** (`backend/app/models/event.py`)
```python
class Event(Base):
    # ... existing fields
    priority = Column(String, default="normal")
```

**Step 2: API schemas** (`backend/app/routers/events.py`)
```python
class EventCreate(BaseModel):
    # ... existing fields
    priority: Optional[str] = "normal"

class EventResponse(EventBase):
    priority: str
```

**Step 3: React types** (`src/types/index.ts`)
```typescript
interface Event {
  // ... existing fields
  priority: 'low' | 'normal' | 'high';
}
```

**Step 4: React form** (`src/components/events/EventForm.tsx`)
```tsx
<select name="priority" value={formData.priority}>
  <option value="low">Low</option>
  <option value="normal">Normal</option>
  <option value="high">High</option>
</select>
```

**Step 5: Reset database**
```bash
rm backend/weekly_review.db
```

---

### Scenario 3: "I want to change when bills are considered 'overdue'"

**Layer:** API only

**File:** `backend/app/routers/finances.py`

**Current logic:**
```python
@router.get("/overdue")
def get_overdue_items(db: Session = Depends(get_db)):
    today = date.today()
    return db.query(FinancialItem).filter(
        FinancialItem.is_paid == False,
        FinancialItem.due_date < today  # Due before today
    ).all()
```

**New logic (overdue = 3+ days past due):**
```python
@router.get("/overdue")
def get_overdue_items(db: Session = Depends(get_db)):
    threshold = date.today() - timedelta(days=3)
    return db.query(FinancialItem).filter(
        FinancialItem.is_paid == False,
        FinancialItem.due_date < threshold  # Due 3+ days ago
    ).all()
```

---

### Scenario 4: "I want to add a new page"

**Layer:** React only

**Step 1: Create page component** (`src/pages/NotesPage.tsx`)
```tsx
export default function NotesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl text-cyan-400">Notes</h1>
      {/* Page content */}
    </div>
  );
}
```

**Step 2: Add route** (`src/App.tsx`)
```tsx
import NotesPage from './pages/NotesPage';

// In the Routes
<Route path="/notes" element={<NotesPage />} />
```

**Step 3: Add to sidebar** (`src/components/shell/Sidebar.tsx`)
```tsx
<NavItem href="/notes" icon={FileText}>Notes</NavItem>
```

---

### Scenario 5: "I want to change the window size"

**Layer:** Tauri only

**File:** `src-tauri/tauri.conf.json`

```json
"windows": [{
  "width": 1600,   // Change from 1280
  "height": 1000,  // Change from 800
  "minWidth": 1200,
  "minHeight": 700
}]
```

---

### Scenario 6: "I want to change system tray options"

**Layer:** Tauri only

**File:** `src-tauri/src/lib.rs`

```rust
let tray_menu = Menu::with_items(app, &[
    &MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?,
    &MenuItem::with_id(app, "quick_add", "Quick Add...", true, None::<&str>)?,  // NEW
    &PredefinedMenuItem::separator(app)?,
    &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
])?;
```

---

### Scenario 7: "I want to change what shows on the home dashboard"

**Layers:** API + React

**API (what data is calculated):** `backend/app/routers/summary.py`

**React (how it's displayed):** `src/components/home/HomeView.tsx`

---

### Scenario 8: "I want to change the lens modes"

**Layers:** React (state + display)

**State definition:** `src/stores/appStore.ts`
```typescript
activeLens: 'normal' | 'risk' | 'money' | 'custom';  // Add 'custom'
```

**Toggle UI:** `src/components/shell/LensToggle.tsx`

**Components that react to lens:** Various components check `activeLens` and display differently.

---

## Checklist: After Making Changes

### React changes (UI only)
- [ ] Save file
- [ ] Check browser (hot reload updates automatically)
- [ ] Run `npm run test` to verify tests pass

### API changes (backend logic)
- [ ] Save file
- [ ] Server auto-restarts (if using --reload)
- [ ] Test endpoint in Swagger UI
- [ ] Run `cd backend && python -m pytest tests/ -v`

### Database changes (new fields/tables)
- [ ] Update model in `backend/app/models/`
- [ ] Update schema in `backend/app/routers/`
- [ ] Update types in `src/types/index.ts`
- [ ] Reset database: `rm backend/weekly_review.db`
- [ ] Restart server
- [ ] Update React components to use new fields

### Tauri changes (desktop features)
- [ ] Save file
- [ ] Restart: `npm run tauri dev` (Rust recompile needed)
- [ ] Test the feature

---

## Layer Communication Summary

| From | To | How |
|------|-----|-----|
| User | React | Clicks, typing |
| React | API | HTTP requests (`src/api/client.ts`) |
| API | Database | SQLAlchemy queries |
| Database | API | Query results |
| API | React | JSON responses |
| React | User | Rendered UI |
| Tauri | React | Hosts in WebView |
| Tauri | OS | Native APIs (tray, notifications) |
