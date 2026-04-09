/**
 * BillPanel Tests — Part 3 (Form fields)
 * Split into small files to avoid vitest worker OOM on Windows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BillPanel } from '@/components/panels/BillPanel';

vi.mock('@/hooks/useFinances', () => ({
  useFinancialItem: vi.fn(() => ({ data: undefined, isLoading: false })),
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
    data: [{ id: 1, name: 'Utilities', created_at: '', updated_at: '' }],
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

describe('BillPanel — Fields', () => {
  const onClose = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); });

  it('has amount input field', () => {
    render(<BillPanel billId={null} date="2026-02-10" onClose={onClose} />, { wrapper: createWrapper() });
    expect(screen.getByText('Amount')).toBeTruthy();
  });

  it('hides delete button in create mode', () => {
    render(<BillPanel billId={null} date="2026-02-10" onClose={onClose} />, { wrapper: createWrapper() });
    expect(screen.queryByText('Delete')).toBeNull();
  });
});
