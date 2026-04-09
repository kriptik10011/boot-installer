/**
 * BillPanel Tests — Part 1 (Create + Loading)
 * Split into small files to avoid vitest worker OOM on Windows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BillPanel } from '@/components/panels/BillPanel';

vi.mock('@/hooks/useFinances', () => ({
  useFinancialItem: vi.fn((id: number) => {
    if (id === 0) return { data: undefined, isLoading: false };
    if (id === 999) return { data: undefined, isLoading: true };
    return {
      data: {
        id: 1, name: 'Electric Bill', amount: 125.50, date: '2026-02-15',
        category_id: 1, is_paid: false, notes: 'Monthly electric',
        is_recurring: false, recurrence_rule_id: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      isLoading: false,
    };
  }),
  useCreateFinancialItem: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateFinancialItem: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteFinancialItem: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useMarkPaid: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  financeKeys: { all: ['finances'], lists: () => ['finances', 'list'] },
}));

vi.mock('@/api/client', () => ({
  financesApi: { delete: vi.fn() },
}));

vi.mock('@/hooks/useUndoDelete', () => ({
  useUndoDelete: vi.fn(() => ({ requestDelete: vi.fn() })),
}));

vi.mock('@/stores/toastStore', () => ({
  useToastStore: vi.fn((selector: any) => selector({ addToast: vi.fn() })),
}));

vi.mock('@/hooks/useRecurrence', () => ({
  useCreateRecurrenceRule: vi.fn(() => ({ mutateAsync: vi.fn().mockResolvedValue({ id: 1 }), isPending: false })),
  useRecurrenceRule: vi.fn(() => ({ data: undefined, isLoading: false })),
  useDeleteRecurrenceRule: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/useCategories', () => ({
  useFinancialCategories: vi.fn(() => ({
    data: [
      { id: 1, name: 'Utilities', created_at: '', updated_at: '' },
      { id: 2, name: 'Rent', created_at: '', updated_at: '' },
    ],
    isLoading: false,
  })),
}));

vi.mock('@/utils/dateUtils', () => ({
  getTodayLocal: vi.fn(() => '2026-02-10'),
  isBefore: vi.fn((a: string, b: string) => a < b),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('BillPanel — Create & Loading', () => {
  const onClose = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders create form when billId is null', () => {
    render(<BillPanel billId={null} date="2026-02-10" onClose={onClose} />, { wrapper: createWrapper() });
    expect(screen.getByText('Add Item')).toBeTruthy();
  });

  it('shows loading skeleton when fetching bill', () => {
    render(<BillPanel billId={999} date="2026-02-10" onClose={onClose} />, { wrapper: createWrapper() });
    expect(screen.queryByText('Add Item')).toBeNull();
    expect(screen.queryByText('Save Changes')).toBeNull();
  });

  it('renders RecurrencePicker toggle', () => {
    render(<BillPanel billId={null} date="2026-02-10" onClose={onClose} />, { wrapper: createWrapper() });
    expect(screen.getByText('Repeats')).toBeTruthy();
    expect(screen.getByRole('switch')).toBeTruthy();
  });
});
