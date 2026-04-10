# Quick Reference Guide

## Starting the App

### Development Mode (Testing)

```bash
# Terminal 1: Start backend
cd backend
uvicorn app.main:app --reload
# API now running at http://localhost:8000

# Terminal 2: Start frontend
npm run dev
# UI now running at http://localhost:5173

# Terminal 3: Start full Tauri app (optional)
npm run tauri dev
# Desktop app with all features
```

### What Each Mode Gives You

| Mode | Command | What Works |
|------|---------|------------|
| Backend only | `uvicorn app.main:app --reload` | API testing, Swagger UI |
| Frontend only | `npm run dev` | UI in browser (needs backend) |
| Full app | `npm run tauri dev` | Everything including tray, notifications |

---

## Common File Locations

### "Where do I find...?"

| What | Location |
|------|----------|
| Window size/app name | `src-tauri/tauri.conf.json` |
| System tray menu | `src-tauri/src/lib.rs` |
| Sidebar navigation | `src/components/shell/Sidebar.tsx` |
| Page layouts | `src/pages/*.tsx` |
| Component styles | Inside each `.tsx` file (Tailwind classes) |
| API calls | `src/api/client.ts` |
| Data fetching hooks | `src/hooks/*.ts` |
| Global state (week, lens) | `src/stores/appStore.ts` |
| API endpoints | `backend/app/routers/*.py` |
| Database tables | `backend/app/models/*.py` |
| Database file | `backend/weekly_review.db` |

---

## Common Changes

### Change Colors

All styling uses Tailwind CSS classes directly in components.

```tsx
// Find the component, change the class
// Before
<div className="bg-slate-800">

// After (darker)
<div className="bg-slate-900">
```

**Color reference:**
- `slate-900` - Darkest background
- `slate-800` - Card backgrounds
- `cyan-400` - Primary text/accents
- `amber-500` - Warnings
- `red-500` - Errors/overdue
- `green-500` - Success/paid

### Change Text

Find the component and edit the text directly.

```tsx
// src/components/shell/Sidebar.tsx
<NavItem href="/events" icon={Calendar}>
  Events  // Change this text
</NavItem>
```

### Add a Form Field

1. Find the form component
2. Add state for the field
3. Add the input element
4. Include in the submit data

```tsx
// Example: Adding "priority" to EventForm.tsx
const [priority, setPriority] = useState('normal');

// In the form JSX
<select value={priority} onChange={e => setPriority(e.target.value)}>
  <option value="low">Low</option>
  <option value="normal">Normal</option>
  <option value="high">High</option>
</select>

// In the submit function
const data = { ...formData, priority };
```

---

## Running Tests

```bash
# Frontend tests
npm run test

# Backend tests
cd backend
python -m pytest tests/ --ignore=tests/stress/ -v

# Both
npm run test && cd backend && python -m pytest tests/ --ignore=tests/stress/ -v
```

---

## API Testing (Swagger UI)

```bash
cd backend
uvicorn app.main:app --reload
```

Open http://localhost:8000/docs in browser.

You can:
- See all endpoints
- Test API calls directly
- See request/response schemas

---

## Database Operations

```bash
cd backend

# View data
sqlite3 weekly_review.db "SELECT * FROM events;"

# Backup
cp weekly_review.db backup.db

# Reset (delete all data)
rm weekly_review.db
uvicorn app.main:app --reload
```

---

## Build for Production

```bash
# Build frontend only
npm run build

# Build full desktop app
npm run tauri build
# Output in src-tauri/target/release/
```

---

## Troubleshooting

### "API not responding"

```bash
# Check if backend is running
curl http://localhost:8000/api/health
# Should return {"status": "healthy"}

# If not, start it
cd backend && uvicorn app.main:app --reload
```

### "UI not loading"

```bash
# Check if frontend is running
curl http://localhost:5173
# Should return HTML

# If not, start it
npm run dev
```

### "Database error"

```bash
# Check if database exists
ls backend/weekly_review.db

# If corrupted, reset
rm backend/weekly_review.db
cd backend && uvicorn app.main:app --reload
```

### "Tauri won't start"

```bash
# Check Rust is installed
rustc --version

# Rebuild
npm run tauri dev
```
