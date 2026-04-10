# React Layer (Frontend UI)

## What Is React?

React is a JavaScript library for building user interfaces. Everything you see in the app - buttons, forms, lists, calendars - is a React component.

## Why React?

| Need | React Solution |
|------|----------------|
| Complex UIs | Break into reusable components |
| Dynamic updates | State changes auto-update UI |
| Type safety | TypeScript catches errors |
| Data fetching | TanStack Query handles caching |

---

## File Structure

```
src/
├── main.tsx                 # Entry point (renders App)
├── App.tsx                  # Main app + routing
├── index.css                # Tailwind CSS imports
│
├── components/              # UI Components (organized by feature)
│   ├── shell/               # App layout components
│   │   ├── AppShell.tsx     # Main layout wrapper
│   │   ├── Sidebar.tsx      # Left navigation
│   │   ├── Header.tsx       # Top bar (week nav, health, lens)
│   │   ├── DetailDrawer.tsx # Right-side drawer (400px)
│   │   └── CommandPalette.tsx # Cmd+K quick add/search
│   │
│   ├── home/                # Home page components
│   │   ├── HomeView.tsx     # 3-panel layout
│   │   ├── EventsPanel.tsx  # Events summary
│   │   ├── BillsPanel.tsx   # Bills summary
│   │   └── MealsPanel.tsx   # Meals summary
│   │
│   ├── events/              # Events feature
│   │   ├── EventsList.tsx   # List view
│   │   ├── EventsCalendar.tsx # Calendar view
│   │   └── EventForm.tsx    # Create/edit form
│   │
│   ├── meals/               # Meal planning feature
│   │   ├── MealGrid.tsx     # 7x3 grid
│   │   └── RecipePicker.tsx # Select recipe modal
│   │
│   ├── finances/            # Finances feature
│   │   ├── FinancesList.tsx # List view
│   │   ├── FinancesTimeline.tsx # Timeline view
│   │   └── FinancialItemForm.tsx
│   │
│   ├── recipes/             # Recipes feature
│   │   ├── RecipesGrid.tsx  # Grid view
│   │   └── RecipeForm.tsx   # Create/edit form
│   │
│   ├── settings/            # Settings page
│   │   ├── DataManagement.tsx # Backup/restore
│   │   └── NotificationSettings.tsx
│   │
│   └── shared/              # Reusable components
│       ├── Button.tsx
│       ├── Modal.tsx
│       └── LoadingSpinner.tsx
│
├── pages/                   # Page-level components (routes)
│   ├── HomePage.tsx         # /
│   ├── EventsPage.tsx       # /events
│   ├── MealsPage.tsx        # /meals
│   ├── FinancesPage.tsx     # /finances
│   ├── RecipesPage.tsx      # /recipes
│   ├── ShoppingListPage.tsx # /shopping
│   └── SettingsPage.tsx     # /settings
│
├── hooks/                   # Custom React hooks (data fetching)
│   ├── useEvents.ts         # Events CRUD + queries
│   ├── useRecipes.ts        # Recipes CRUD + queries
│   ├── useFinances.ts       # Finances CRUD + queries
│   ├── useMeals.ts          # Meal planning
│   ├── useHome.ts           # Home dashboard data
│   ├── useSearch.ts         # Global search
│   ├── useBackup.ts         # Backup/restore
│   └── useNotifications.ts  # Notification preferences
│
├── stores/                  # Global state (Zustand)
│   └── appStore.ts          # Week, lens, drawer state
│
├── api/                     # API communication
│   └── client.ts            # All API calls (300+ lines)
│
├── types/                   # TypeScript type definitions
│   └── index.ts             # Event, Recipe, FinancialItem, etc.
│
└── test/                    # Frontend tests
    ├── setup.ts
    └── *.test.tsx
```

---

## Key Concepts

### 1. Components

Everything is a component. Components are like LEGO blocks.

```tsx
// Simple component example
function EventItem({ event }: { event: Event }) {
  return (
    <div className="p-4 bg-slate-800 rounded">
      <h3 className="text-cyan-400">{event.name}</h3>
      <p className="text-slate-400">{event.date}</p>
    </div>
  );
}
```

### 2. State Management (Zustand)

Global state that any component can access.

```tsx
// src/stores/appStore.ts
interface AppState {
  currentWeekStart: string;      // Which week are we viewing?
  activeLens: 'normal' | 'risk' | 'money';  // View mode
  drawerOpen: boolean;           // Is right drawer visible?

  // Actions
  goToNextWeek: () => void;
  goToPreviousWeek: () => void;
  setActiveLens: (lens: LensType) => void;
}
```

**Using in a component:**
```tsx
function Header() {
  const { currentWeekStart, goToNextWeek, goToPreviousWeek } = useAppStore();

  return (
    <div>
      <button onClick={goToPreviousWeek}>← Prev</button>
      <span>{currentWeekStart}</span>
      <button onClick={goToNextWeek}>Next →</button>
    </div>
  );
}
```

### 3. Data Fetching (TanStack Query)

Hooks that fetch data from the API with caching.

```tsx
// src/hooks/useEvents.ts
export function useWeekEvents(weekStart: string) {
  return useQuery({
    queryKey: ['events', 'week', weekStart],  // Cache key
    queryFn: () => eventsApi.getWeek(weekStart),  // API call
  });
}

// Using in a component
function EventsPage() {
  const { currentWeekStart } = useAppStore();
  const { data: events, isLoading, error } = useWeekEvents(currentWeekStart);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div>Error loading events</div>;

  return (
    <div>
      {events.map(event => <EventItem key={event.id} event={event} />)}
    </div>
  );
}
```

### 4. API Client

All API calls are centralized in `src/api/client.ts`.

```tsx
// src/api/client.ts
const API_BASE = 'http://localhost:8000/api';

export const eventsApi = {
  list: () => fetch(`${API_BASE}/events`).then(r => r.json()),
  getWeek: (weekStart: string) =>
    fetch(`${API_BASE}/events/week/${weekStart}`).then(r => r.json()),
  create: (data: EventCreate) =>
    fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),
  // ... update, delete
};
```

---

## Styling with Tailwind CSS

No separate CSS files. Styles are written directly in the component.

```tsx
<button className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded">
  Save Event
</button>
```

### Design Tokens (Color Palette)

| Color | Usage | Tailwind Class |
|-------|-------|----------------|
| Slate (900, 800, 700) | Backgrounds | `bg-slate-900` |
| Cyan | Primary actions | `text-cyan-400`, `bg-cyan-600` |
| Amber | Warnings/alerts | `text-amber-500` |
| Red | Errors/overdue | `text-red-500` |
| Green | Success/paid | `text-green-500` |

---

## Common Modifications

### Change a Button's Appearance

Find the component, modify the `className`:

```tsx
// Before
<button className="bg-cyan-600 text-white">Save</button>

// After (larger, with icon)
<button className="bg-cyan-600 text-white px-6 py-3 text-lg flex items-center gap-2">
  <SaveIcon /> Save Event
</button>
```

### Add a New Field to a Form

1. Update the form component (e.g., `EventForm.tsx`)
2. Add the new field to the state
3. Include in the API call

```tsx
// EventForm.tsx
const [priority, setPriority] = useState('normal');

return (
  <form>
    {/* Existing fields */}

    {/* New field */}
    <label>Priority</label>
    <select value={priority} onChange={e => setPriority(e.target.value)}>
      <option value="low">Low</option>
      <option value="normal">Normal</option>
      <option value="high">High</option>
    </select>
  </form>
);
```

### Change Navigation

Edit `src/App.tsx` for routes, `src/components/shell/Sidebar.tsx` for menu items.

---

## When to Modify React

| If You Want To... | Modify... |
|-------------------|-----------|
| Change how something looks | Component's `className` |
| Add a new page | `App.tsx` (route) + `pages/` (component) |
| Add a form field | Form component + types |
| Change sidebar items | `Sidebar.tsx` |
| Change week navigation | `Header.tsx` or `appStore.ts` |
| Change data fetching | `hooks/` folder |
| Add a new API call | `api/client.ts` |

---

## Testing React Changes

```bash
# Start dev server (hot reload)
npm run dev

# Run tests
npm run test

# Build for production
npm run build
```

Changes appear instantly in the browser (hot reload). No rebuild needed.
