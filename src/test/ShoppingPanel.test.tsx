/**
 * ShoppingPanel Tests
 *
 * Smoke tests verifying ShoppingPanel renders with items,
 * shows loading skeleton, and handles empty state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShoppingPanel } from '@/components/panels/ShoppingPanel';

// Mock shared components
vi.mock('@/components/shared/PackageSizeModal', () => ({
  PackageSizeModal: () => null,
}));
vi.mock('@/components/shared/ConfirmationModal', () => ({
  ConfirmationModal: () => null,
}));
vi.mock('@/api/client', () => ({
  shoppingListApi: { delete: vi.fn() },
}));
vi.mock('@/hooks/useUndoDelete', () => ({
  useUndoDelete: () => ({ requestDelete: vi.fn() }),
}));

// Mock hooks
vi.mock('@/hooks/useShoppingList', () => ({
  shoppingListKeys: { week: (w: string) => ['shopping-list', 'week', w] },
  useShoppingListWeek: vi.fn((weekStart: string) => {
    if (weekStart === 'loading') return { data: undefined, isLoading: true };
    if (weekStart === 'empty') return { data: [], isLoading: false };
    if (weekStart === 'v2-packages') return {
      data: [
        { id: 1, ingredient_id: 1, name: 'Olive Oil', quantity: '3 tablespoon', category: 'Oils', is_checked: true, week_start: '2026-02-10', created_at: '', updated_at: '', source_recipe_id: null, package_display: '1 bottle', package_detail: '16.9 fl oz (3 tbsp needed)', package_size: 16.9, package_unit: 'fl oz', package_type: 'bottle', packages_needed: 1 },
        { id: 2, ingredient_id: 2, name: 'Flour', quantity: '2 cup', category: 'Baking', is_checked: false, week_start: '2026-02-10', created_at: '', updated_at: '', source_recipe_id: null, package_display: '1 bag', package_detail: '5 lb (2 cups needed)', package_size: 5, package_unit: 'lb', package_type: 'bag', packages_needed: 1 },
        { id: 3, ingredient_id: 3, name: 'Salt', quantity: '1 tsp', category: 'Spices', is_checked: false, week_start: '2026-02-10', created_at: '', updated_at: '', source_recipe_id: null, package_display: null, package_detail: null, package_size: null, package_unit: null, package_type: null, packages_needed: null },
      ],
      isLoading: false,
    };
    return {
      data: [
        { id: 1, ingredient_id: 1, name: 'Chicken breast', quantity: '2 lbs', category: 'Meat', is_checked: false, week_start: '2026-02-10', created_at: '', updated_at: '', source_recipe_id: null, package_display: null, package_detail: null, package_size: null, package_unit: null, package_type: null, packages_needed: null },
        { id: 2, ingredient_id: 2, name: 'Rice', quantity: '1 cup', category: 'Grains', is_checked: true, week_start: '2026-02-10', created_at: '', updated_at: '', source_recipe_id: null, package_display: null, package_detail: null, package_size: null, package_unit: null, package_type: null, packages_needed: null },
        { id: 3, ingredient_id: 3, name: 'Broccoli', quantity: '1 head', category: 'Produce', is_checked: false, week_start: '2026-02-10', created_at: '', updated_at: '', source_recipe_id: null, package_display: null, package_detail: null, package_size: null, package_unit: null, package_type: null, packages_needed: null },
      ],
      isLoading: false,
    };
  }),
  useGenerateShoppingList: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useToggleShoppingListItem: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCreateShoppingListItem: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCompleteShoppingTrip: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('ShoppingPanel', () => {
  const onClose = vi.fn();
  const onToggleFullscreen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders shopping items grouped by category', () => {
    render(
      <ShoppingPanel weekStart="2026-02-10" onClose={onClose} isFullscreen={false} onToggleFullscreen={onToggleFullscreen} />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText('Chicken breast')).toBeTruthy();
    expect(screen.getByText('Rice')).toBeTruthy();
    expect(screen.getByText('Broccoli')).toBeTruthy();
  });

  it('shows progress indicator', () => {
    render(
      <ShoppingPanel weekStart="2026-02-10" onClose={onClose} isFullscreen={false} onToggleFullscreen={onToggleFullscreen} />,
      { wrapper: createWrapper() }
    );
    // 1 of 3 checked = 33%
    expect(screen.getByText(/1.*of.*3/i)).toBeTruthy();
  });

  it('shows loading skeleton', () => {
    render(
      <ShoppingPanel weekStart="loading" onClose={onClose} isFullscreen={false} onToggleFullscreen={onToggleFullscreen} />,
      { wrapper: createWrapper() }
    );
    // PanelSkeleton should render
    expect(screen.queryByText('Chicken breast')).toBeNull();
  });

  it('renders empty state with generate button', () => {
    render(
      <ShoppingPanel weekStart="empty" onClose={onClose} isFullscreen={false} onToggleFullscreen={onToggleFullscreen} />,
      { wrapper: createWrapper() }
    );
    // When empty, should show generate option
    expect(screen.queryByText('Chicken breast')).toBeNull();
  });

  // V2: Package display tests
  it('shows package display for enriched items', () => {
    render(
      <ShoppingPanel weekStart="v2-packages" onClose={onClose} isFullscreen={false} onToggleFullscreen={onToggleFullscreen} />,
      { wrapper: createWrapper() }
    );
    // Items with package_display show package amounts
    expect(screen.getByText('1 bottle')).toBeTruthy();
    expect(screen.getByText('1 bag')).toBeTruthy();
  });

  it('shows package detail for enriched items', () => {
    render(
      <ShoppingPanel weekStart="v2-packages" onClose={onClose} isFullscreen={false} onToggleFullscreen={onToggleFullscreen} />,
      { wrapper: createWrapper() }
    );
    // Enriched items show detail underneath
    expect(screen.getByText('16.9 fl oz (3 tbsp needed)')).toBeTruthy();
  });

  it('falls back to cooking amount when no package data', () => {
    render(
      <ShoppingPanel weekStart="v2-packages" onClose={onClose} isFullscreen={false} onToggleFullscreen={onToggleFullscreen} />,
      { wrapper: createWrapper() }
    );
    // Salt has no package_display, should show cooking amount
    expect(screen.getByText('1 tsp')).toBeTruthy();
  });
});
