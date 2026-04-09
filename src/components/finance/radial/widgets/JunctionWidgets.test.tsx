/**
 * JunctionWidgets render tests
 *
 * Covers the exported widget functions exercised via the registry functions
 * (getWidgetsForJunction, getSubArcWidgetsForJunction) as well as the
 * directly-renderable components. One describe block per logical widget.
 *
 * Strategy:
 * - All external hooks and API calls are mocked.
 * - Components are accessed through the registry helpers so we test the
 *   real integration between the registry and the widgets.
 * - Each test is fully independent: no shared mutable state between tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mock: appStore
// ---------------------------------------------------------------------------

const mockSetLatticePrefs = vi.fn();
const mockAppStoreState = {
  latticePrefs: { cardShape: 'circular' as const, shoppingMode: false },
  setLatticePrefs: mockSetLatticePrefs,
};

vi.mock('@/stores/appStore', () => ({
  useAppStore: (selector: (s: typeof mockAppStoreState) => unknown) =>
    selector(mockAppStoreState),
}));

// ---------------------------------------------------------------------------
// Mock: shopping list hooks
// ---------------------------------------------------------------------------

const mockToggleMutate = vi.fn();
const mockGenerateMutate = vi.fn();
const mockCompleteMutate = vi.fn();
const mockCreateItemMutate = vi.fn();

vi.mock('@/hooks/useShoppingList', () => ({
  shoppingListKeys: { week: (w: string) => ['shopping-list', 'week', w] },
  useShoppingListWeek: vi.fn(() => ({ data: [] })),
  useToggleShoppingListItem: vi.fn(() => ({ mutate: mockToggleMutate, isPending: false })),
  useGenerateShoppingList: vi.fn(() => ({ mutate: mockGenerateMutate, isPending: false })),
  useCompleteShoppingTrip: vi.fn(() => ({ mutate: mockCompleteMutate, isPending: false })),
  useCreateShoppingListItem: vi.fn(() => ({ mutate: mockCreateItemMutate, isPending: false })),
}));

// ---------------------------------------------------------------------------
// Mock: API client
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  shoppingListApi: { delete: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock: useUndoDelete
// ---------------------------------------------------------------------------

const mockRequestDelete = vi.fn();

vi.mock('@/hooks/useUndoDelete', () => ({
  useUndoDelete: () => ({ requestDelete: mockRequestDelete }),
}));

// ---------------------------------------------------------------------------
// Mock: shared modals
// ---------------------------------------------------------------------------

vi.mock('@/components/shared/ConfirmationModal', () => ({
  ConfirmationModal: ({ isOpen, title, onConfirm, onCancel }: {
    isOpen: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    isOpen ? (
      <div data-testid="confirmation-modal">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock('@/components/shared/PackageSizeModal', () => ({
  PackageSizeModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="package-modal" /> : null,
}));

// ---------------------------------------------------------------------------
// Mock: inventory hooks
// ---------------------------------------------------------------------------

const mockCreateInventoryMutate = vi.fn();
const mockBulkCreateMutate = vi.fn();

vi.mock('@/hooks/useInventory', () => ({
  useInventoryItems: vi.fn(() => ({ data: [] })),
  useCreateInventoryItem: vi.fn(() => ({ mutate: mockCreateInventoryMutate, isPending: false })),
  useBulkCreateInventoryItems: vi.fn(() => ({ mutate: mockBulkCreateMutate, isPending: false })),
}));

vi.mock('@/hooks/useInventoryIntelligence', () => ({
  useInventoryIntelligence: vi.fn(() => ({ activeItemCount: 12 })),
}));

// ---------------------------------------------------------------------------
// Mock: habit hooks
// ---------------------------------------------------------------------------

const mockRecordHabitMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/useHabits', () => ({
  useHabits: vi.fn(() => ({ data: [] })),
  useRecordHabit: vi.fn(() => ({ mutateAsync: mockRecordHabitMutateAsync })),
  useHabitsNeedingCheckIn: vi.fn(() => []),
  formatHabitName: (name: string) => name,
}));

// ---------------------------------------------------------------------------
// Mock: event and meal hooks
// ---------------------------------------------------------------------------

const mockCreateEventMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockCreateMealMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/useEvents', () => ({
  useWeekEvents: vi.fn(() => ({ data: [] })),
  useCreateEvent: vi.fn(() => ({ mutateAsync: mockCreateEventMutateAsync })),
}));

vi.mock('@/hooks/useMeals', () => ({
  useCreateMeal: vi.fn(() => ({ mutateAsync: mockCreateMealMutateAsync })),
}));

vi.mock('@/hooks/useEventIntelligence', () => ({
  useEventIntelligence: vi.fn(() => ({ dayInsights: [], byDate: {}, upcoming: [], weekEventCount: 0 })),
}));

// ---------------------------------------------------------------------------
// Mock: date utilities — return stable strings so tests are deterministic
// ---------------------------------------------------------------------------

vi.mock('@/utils/dateUtils', () => ({
  getMonday: vi.fn(() => '2026-03-16'),
  getTodayLocal: vi.fn(() => '2026-03-16'),
  addWeeks: vi.fn((_base: string, n: number) => `2026-03-${16 + n * 7}`),
}));

// ---------------------------------------------------------------------------
// Mock: settings widgets (SW junction) — external components not under test
// ---------------------------------------------------------------------------

vi.mock('../settings/SettingsPanel', () => ({
  SettingsGeneralWidget: () => <div data-testid="settings-general">General</div>,
  SettingsCustomizeWidget: () => <div data-testid="settings-customize">Customize</div>,
  SettingsLatticeWidget: () => <div data-testid="settings-lattice">Lattice</div>,
}));

// ---------------------------------------------------------------------------
// Mock: WeeklyReviewWizard (lazy-loaded)
// ---------------------------------------------------------------------------

vi.mock('@/components/week/WeeklyReviewWizard', () => ({
  WeeklyReviewWizardWidget: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="weekly-review-wizard">
      <button onClick={onClose}>Close review</button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Mock: arcHelpers (SVG path helper — not meaningful in happy-dom)
// ---------------------------------------------------------------------------

vi.mock('../cards/shared/arcHelpers', () => ({
  arcPath: () => 'M 0 0',
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderNode(node: ReactNode) {
  return render(<>{node}</>, { wrapper: createWrapper() });
}

// Import registry functions + types after all mocks are declared
import {
  getWidgetsForJunction,
  getSubArcWidgetsForJunction,
  JUNCTION_CARD_COUNT,
  type JunctionData,
} from './JunctionWidgets';

import { useShoppingListWeek } from '@/hooks/useShoppingList';
import { useInventoryItems } from '@/hooks/useInventory';
import { useInventoryIntelligence } from '@/hooks/useInventoryIntelligence';
import { useHabits, useHabitsNeedingCheckIn } from '@/hooks/useHabits';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function baseJunctionData(overrides: Partial<JunctionData> = {}): JunctionData {
  return {
    shoppingItems: [],
    habits: [],

    onCloseReview: vi.fn(),
    ...overrides,
  };
}

function makeShoppingItems(count: number, checkedCount = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Item ${i + 1}`,
    checked: i < checkedCount,
    is_checked: i < checkedCount,
    week_start: '2026-03-16',
    created_at: '',
    updated_at: '',
    ingredient_id: i + 1,
    category: 'General',
    quantity: null,
    source_recipe_id: null,
    package_display: null,
    package_detail: null,
    package_size: null,
    package_unit: null,
    package_type: null,
    packages_needed: null,
  }));
}

// ---------------------------------------------------------------------------
// JUNCTION_CARD_COUNT
// ---------------------------------------------------------------------------

describe('JUNCTION_CARD_COUNT', () => {
  it('nw has 1 card', () => {
    expect(JUNCTION_CARD_COUNT.nw).toBe(1);
  });

  it('ne has 1 card (Weekly Review wizard)', () => {
    expect(JUNCTION_CARD_COUNT.ne).toBe(1);
  });

  it('se has 1 card (merged HabitJunction)', () => {
    expect(JUNCTION_CARD_COUNT.se).toBe(1);
  });

  it('sw has 3 cards', () => {
    expect(JUNCTION_CARD_COUNT.sw).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// NW — ShoppingJunctionWidget (empty state)
// ---------------------------------------------------------------------------

describe('ShoppingJunctionWidget — empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useShoppingListWeek).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useShoppingListWeek>);
    mockAppStoreState.latticePrefs.shoppingMode = false;
  });

  function renderShoppingWidget() {
    const { widgets } = getWidgetsForJunction('nw', baseJunctionData());
    return renderNode(widgets[0]);
  }

  it('renders without crashing', () => {
    renderShoppingWidget();
  });

  it('shows This Week and Next Week toggle buttons', () => {
    renderShoppingWidget();
    expect(screen.getByRole('button', { name: 'This Week' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next Week' })).toBeTruthy();
  });

  it('shows EMPTY label when no items', () => {
    renderShoppingWidget();
    expect(screen.getByText('EMPTY')).toBeTruthy();
  });

  it('shows Generate button in empty state', () => {
    renderShoppingWidget();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
  });

  it('shows + Add button in empty state', () => {
    renderShoppingWidget();
    expect(screen.getByRole('button', { name: '+ Add' })).toBeTruthy();
  });

  it('clicking Generate calls generate mutate', () => {
    renderShoppingWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(mockGenerateMutate).toHaveBeenCalledOnce();
  });

  it('clicking + Add reveals item name input', () => {
    renderShoppingWidget();
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));
    expect(screen.getByPlaceholderText('Item name...')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// NW — ShoppingJunctionWidget (populated state)
// ---------------------------------------------------------------------------

describe('ShoppingJunctionWidget — populated state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const items = makeShoppingItems(3, 1);
    vi.mocked(useShoppingListWeek).mockReturnValue({
      data: items,
    } as unknown as ReturnType<typeof useShoppingListWeek>);
    mockAppStoreState.latticePrefs.shoppingMode = false;
  });

  function renderShoppingWidget() {
    const data = baseJunctionData({
      shoppingItems: makeShoppingItems(3, 1),
    });
    const { widgets } = getWidgetsForJunction('nw', data);
    return renderNode(widgets[0]);
  }

  it('renders without crashing', () => {
    renderShoppingWidget();
  });

  it('shows item counter in header', () => {
    renderShoppingWidget();
    // 1 of 3 checked
    expect(screen.getByText('1/3 items')).toBeTruthy();
  });

  it('shows Shop mode toggle button', () => {
    renderShoppingWidget();
    expect(screen.getByRole('button', { name: 'Shop' })).toBeTruthy();
  });

  it('shows + Add button in populated state', () => {
    renderShoppingWidget();
    expect(screen.getByRole('button', { name: '+ Add' })).toBeTruthy();
  });

  it('shows unchecked item names', () => {
    renderShoppingWidget();
    expect(screen.getByText('Item 2')).toBeTruthy();
    expect(screen.getByText('Item 3')).toBeTruthy();
  });

  it('shows Done button when checked items exist', () => {
    renderShoppingWidget();
    expect(screen.getByRole('button', { name: /Done \(1\)/ })).toBeTruthy();
  });

  it('clicking Done opens ConfirmationModal', () => {
    renderShoppingWidget();
    fireEvent.click(screen.getByRole('button', { name: /Done \(1\)/ }));
    expect(screen.getByTestId('confirmation-modal')).toBeTruthy();
  });

  it('confirming completion calls completeTrip mutate', () => {
    renderShoppingWidget();
    fireEvent.click(screen.getByRole('button', { name: /Done \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(mockCompleteMutate).toHaveBeenCalledOnce();
  });

  it('cancelling ConfirmationModal closes it', () => {
    renderShoppingWidget();
    fireEvent.click(screen.getByRole('button', { name: /Done \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('confirmation-modal')).toBeNull();
  });

  it('clicking Shop calls setLatticePrefs to enable shopping mode', () => {
    renderShoppingWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Shop' }));
    expect(mockSetLatticePrefs).toHaveBeenCalledWith({ shoppingMode: true });
  });
});

// ---------------------------------------------------------------------------
// NW — ShoppingJunctionWidget (shopping mode)
// ---------------------------------------------------------------------------

describe('ShoppingJunctionWidget — shopping mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const items = makeShoppingItems(2, 0);
    vi.mocked(useShoppingListWeek).mockReturnValue({
      data: items,
    } as unknown as ReturnType<typeof useShoppingListWeek>);
    mockAppStoreState.latticePrefs.shoppingMode = true;
  });

  afterEach(() => {
    mockAppStoreState.latticePrefs.shoppingMode = false;
  });

  function renderShoppingWidget() {
    const { widgets } = getWidgetsForJunction('nw', baseJunctionData({
      shoppingItems: makeShoppingItems(2, 0),
    }));
    return renderNode(widgets[0]);
  }

  it('renders without crashing in shopping mode', () => {
    renderShoppingWidget();
  });

  it('shows Exit button in shopping mode', () => {
    renderShoppingWidget();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeTruthy();
  });

  it('does NOT show item counter header in shopping mode', () => {
    renderShoppingWidget();
    expect(screen.queryByText(/\d+\/\d+ items/)).toBeNull();
  });

  it('clicking Exit calls setLatticePrefs to disable shopping mode', () => {
    renderShoppingWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(mockSetLatticePrefs).toHaveBeenCalledWith({ shoppingMode: false });
  });
});

// ---------------------------------------------------------------------------
// NW — registry: bezelSvg present when items exist
// ---------------------------------------------------------------------------

describe('getWidgetsForJunction nw — registry', () => {
  it('returns one widget', () => {
    const { widgets } = getWidgetsForJunction('nw', baseJunctionData());
    expect(widgets).toHaveLength(1);
  });

  it('label is Empty when no items', () => {
    const { labels } = getWidgetsForJunction('nw', baseJunctionData({ shoppingItems: [] }));
    expect(labels[0]).toBe('Empty');
  });

  it('label shows checked/total when items exist', () => {
    const data = baseJunctionData({
      shoppingItems: [
        { id: 1, name: 'Apple', checked: true },
        { id: 2, name: 'Milk', checked: false },
      ],
    });
    const { labels } = getWidgetsForJunction('nw', data);
    expect(labels[0]).toBe('1/2 items');
  });

  it('no bezelSvg when no items', () => {
    const { bezelSvg } = getWidgetsForJunction('nw', baseJunctionData({ shoppingItems: [] }));
    expect(bezelSvg).toBeUndefined();
  });

  it('provides bezelSvg when items exist', () => {
    const data = baseJunctionData({
      shoppingItems: [{ id: 1, name: 'Apple', checked: false }],
    });
    const { bezelSvg } = getWidgetsForJunction('nw', data);
    expect(bezelSvg).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// NE — Weekly Review wizard (always single card)
// ---------------------------------------------------------------------------

describe('getWidgetsForJunction ne — weekly review', () => {
  it('returns 1 wizard widget (always)', () => {
    const { widgets, labels } = getWidgetsForJunction('ne', baseJunctionData());
    expect(widgets).toHaveLength(1);
    expect(labels).toEqual(['Weekly Review']);
  });
});

// ---------------------------------------------------------------------------
// SE — HabitJunctionWidget (merged, self-fetching via useHabits)
// ---------------------------------------------------------------------------

describe('getWidgetsForJunction se — registry (merged)', () => {
  it('returns 1 widget (merged HabitJunction)', () => {
    const { widgets } = getWidgetsForJunction('se', baseJunctionData());
    expect(widgets).toHaveLength(1);
  });

  it('labels are Habits', () => {
    const { labels } = getWidgetsForJunction('se', baseJunctionData());
    expect(labels).toEqual(['Habits']);
  });
});

// ---------------------------------------------------------------------------
// SW — Settings widgets
// ---------------------------------------------------------------------------

describe('getWidgetsForJunction sw — settings', () => {
  it('returns 3 settings widgets', () => {
    const { widgets } = getWidgetsForJunction('sw', baseJunctionData());
    expect(widgets).toHaveLength(3);
  });

  it('labels are General, Domains, Shaders', () => {
    const { labels } = getWidgetsForJunction('sw', baseJunctionData());
    expect(labels).toEqual(['General', 'Domains', 'Shaders']);
  });

  it('renders SettingsGeneralWidget', () => {
    const { widgets } = getWidgetsForJunction('sw', baseJunctionData());
    renderNode(widgets[0]);
    expect(screen.getByTestId('settings-general')).toBeTruthy();
  });

  it('renders SettingsCustomizeWidget', () => {
    const { widgets } = getWidgetsForJunction('sw', baseJunctionData());
    renderNode(widgets[1]);
    expect(screen.getByTestId('settings-customize')).toBeTruthy();
  });

  it('renders SettingsLatticeWidget', () => {
    const { widgets } = getWidgetsForJunction('sw', baseJunctionData());
    renderNode(widgets[2]);
    expect(screen.getByTestId('settings-lattice')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// InventoryQuickAddWidget
// ---------------------------------------------------------------------------

describe('InventoryQuickAddWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useInventoryItems).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useInventoryItems>);
  });

  function renderQuickAdd() {
    const { widgets } = getSubArcWidgetsForJunction('west', 'sw');
    return renderNode(widgets[0]);
  }

  it('renders without crashing', () => {
    renderQuickAdd();
  });

  it('shows item count header', () => {
    renderQuickAdd();
    expect(screen.getByText('12 items')).toBeTruthy();
  });

  it('shows Item name input', () => {
    renderQuickAdd();
    expect(screen.getByPlaceholderText('Item name...')).toBeTruthy();
  });

  it('shows location buttons (Fridge, Pantry, Freezer)', () => {
    renderQuickAdd();
    expect(screen.getByRole('button', { name: 'Fridge' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pantry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Freezer' })).toBeTruthy();
  });

  it('Add button is disabled when input is empty', () => {
    renderQuickAdd();
    const addButton = screen.getByRole('button', { name: 'Add' });
    expect(addButton).toHaveProperty('disabled', true);
  });

  it('clicking a location button changes the active location', () => {
    renderQuickAdd();
    const freezerButton = screen.getByRole('button', { name: 'Freezer' });
    fireEvent.click(freezerButton);
    // After click, Freezer should have the active styling (ButtonGroup uses inline VARIANT border)
    expect(freezerButton.style.border).toContain('rgba(148, 163, 184, 0.45)');
  });

  it('typing a name enables the Add button', () => {
    renderQuickAdd();
    const input = screen.getByPlaceholderText('Item name...');
    fireEvent.change(input, { target: { value: 'Eggs' } });
    const addButton = screen.getByRole('button', { name: 'Add' });
    expect(addButton).toHaveProperty('disabled', false);
  });

  it('clicking Add with a name calls createItem mutate', () => {
    renderQuickAdd();
    const input = screen.getByPlaceholderText('Item name...');
    fireEvent.change(input, { target: { value: 'Eggs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(mockCreateInventoryMutate).toHaveBeenCalledWith(
      { name: 'Eggs', quantity: 1, location: 'fridge' },
      expect.any(Object),
    );
  });

  it('pressing Enter in input calls createItem mutate', () => {
    renderQuickAdd();
    const input = screen.getByPlaceholderText('Item name...');
    fireEvent.change(input, { target: { value: 'Milk' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockCreateInventoryMutate).toHaveBeenCalledOnce();
  });

  it('shows recent items from inventory data', () => {
    vi.mocked(useInventoryItems).mockReturnValue({
      data: [
        { id: 1, name: 'Chicken', location: 'fridge', quantity: 2, unit: null, expiration_date: null, notes: null, category_id: null, package_size: null, package_unit: null, package_label: null, tracking_mode: 'count', created_at: '', updated_at: '' },
      ],
    } as unknown as ReturnType<typeof useInventoryItems>);

    renderQuickAdd();
    expect(screen.getByText('Chicken')).toBeTruthy();
    expect(screen.getByText('fridge')).toBeTruthy();
  });

  it('shows item count from active items', () => {
    vi.mocked(useInventoryIntelligence).mockReturnValue({
      activeItemCount: 2,
    } as unknown as ReturnType<typeof useInventoryIntelligence>);

    renderQuickAdd();
    expect(screen.getByText('2 items')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// InventoryBulkAddWidget
// ---------------------------------------------------------------------------

describe('InventoryBulkAddWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderBulkAdd() {
    const { widgets } = getSubArcWidgetsForJunction('west', 'sw');
    return renderNode(widgets[1]);
  }

  it('renders without crashing', () => {
    renderBulkAdd();
  });

  it('shows Bulk Add header', () => {
    renderBulkAdd();
    expect(screen.getByText('Bulk Add')).toBeTruthy();
  });

  it('shows textarea for paste input', () => {
    renderBulkAdd();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('Add All button is disabled when textarea is empty', () => {
    renderBulkAdd();
    expect(screen.getByRole('button', { name: /Add All \(0\)/ })).toHaveProperty('disabled', true);
  });

  it('shows location buttons for simple list mode', () => {
    renderBulkAdd();
    expect(screen.getByRole('button', { name: 'Fridge' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pantry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Freezer' })).toBeTruthy();
  });

  it('typing a simple list updates parsed count', () => {
    renderBulkAdd();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Apples\nMilk\nBread' } });
    expect(screen.getByText('3 items (list)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add All \(3\)/ })).toHaveProperty('disabled', false);
  });

  it('clicking Add All calls bulkCreate mutate with parsed items', () => {
    renderBulkAdd();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Apples\nMilk' } });
    fireEvent.click(screen.getByRole('button', { name: /Add All \(2\)/ }));
    expect(mockBulkCreateMutate).toHaveBeenCalledOnce();
    const callArgs = mockBulkCreateMutate.mock.calls[0][0];
    expect(callArgs).toHaveLength(2);
    expect(callArgs[0].name).toBe('Apples');
    expect(callArgs[1].name).toBe('Milk');
  });

  it('detects CSV format and hides location buttons', () => {
    renderBulkAdd();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Pantry,Rice,5 lbs,1,12/31/2026,Safe\nFridge,Milk,1 gal,2,01/15/2026' } });
    expect(screen.getByText('CSV detected — locations from Category column')).toBeTruthy();
    // Location buttons should not render in CSV mode
    expect(screen.queryByRole('button', { name: 'Fridge' })).toBeNull();
  });

  it('detects JSON format and shows JSON hint', () => {
    renderBulkAdd();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '[{"name":"Eggs","quantity":2,"location":"fridge"}]' } });
    expect(screen.getByText('JSON detected — locations from each item')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// getSubArcWidgetsForJunction
// ---------------------------------------------------------------------------

describe('getSubArcWidgetsForJunction', () => {
  it('returns 2 widgets for west/sw', () => {
    const { widgets, labels } = getSubArcWidgetsForJunction('west', 'sw');
    expect(widgets).toHaveLength(2);
    expect(labels).toEqual(['Quick Add', 'Bulk Add']);
  });

  it('returns empty for unrecognized arc/junction combination', () => {
    const { widgets, labels } = getSubArcWidgetsForJunction('north', 'nw');
    expect(widgets).toHaveLength(0);
    expect(labels).toHaveLength(0);
  });

  it('provides bezelSvg for west/sw', () => {
    const { bezelSvg } = getSubArcWidgetsForJunction('west', 'sw');
    expect(bezelSvg).toBeTruthy();
  });
});
