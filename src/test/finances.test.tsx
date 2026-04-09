import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFinancialItems, useCreateFinancialItem, useMarkPaid } from '../hooks/useFinances';
import type { FinancialItem } from '../types';

// Mock the API — MUST be before import
vi.mock('../api/client', () => ({
  financesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    markPaid: vi.fn(),
    getOverdue: vi.fn(),
  },
}));

import { financesApi } from '../api/client';

// Sample test data
const mockItems: FinancialItem[] = [
  {
    id: 1,
    name: 'Electric Bill',
    amount: 150.00,
    due_date: '2026-01-25',
    type: 'bill',
    category_id: 1,
    is_paid: false,
    paid_date: null,
    notes: null,
    recurrence_rule_id: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 2,
    name: 'Salary',
    amount: 5000.00,
    due_date: '2026-01-31',
    type: 'income',
    category_id: null,
    is_paid: false,
    paid_date: null,
    notes: 'Monthly salary',
    recurrence_rule_id: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
];

// Helper to create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('Finance Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useFinancialItems', () => {
    it('returns financial items list', async () => {
      vi.mocked(financesApi.list).mockResolvedValue(mockItems);

      const { result } = renderHook(() => useFinancialItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(financesApi.list).toHaveBeenCalledWith(undefined, undefined, undefined);
      expect(result.current.data).toEqual(mockItems);
      expect(result.current.data).toHaveLength(2);
    });

    it('filters by type', async () => {
      const billsOnly = mockItems.filter((i) => i.type === 'bill');
      vi.mocked(financesApi.list).mockResolvedValue(billsOnly);

      const { result } = renderHook(() => useFinancialItems('bill'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(financesApi.list).toHaveBeenCalledWith('bill', undefined, undefined);
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].type).toBe('bill');
    });
  });

  describe('useCreateFinancialItem', () => {
    it('calls API correctly when creating an item', async () => {
      const newItem = {
        name: 'Internet Bill',
        amount: 80.00,
        due_date: '2026-02-01',
        type: 'bill' as const,
      };

      const createdItem: FinancialItem = {
        id: 3,
        ...newItem,
        category_id: null,
        is_paid: false,
        paid_date: null,
        notes: null,
        recurrence_rule_id: null,
        created_at: '2026-01-23T00:00:00Z',
        updated_at: '2026-01-23T00:00:00Z',
      };

      vi.mocked(financesApi.create).mockResolvedValue(createdItem);

      const { result } = renderHook(() => useCreateFinancialItem(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(newItem);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(financesApi.create).toHaveBeenCalledWith(newItem);
    });
  });

  describe('useMarkPaid', () => {
    it('calls API correctly when marking as paid', async () => {
      const paidItem: FinancialItem = {
        ...mockItems[0],
        is_paid: true,
        paid_date: '2026-01-23',
      };

      vi.mocked(financesApi.markPaid).mockResolvedValue(paidItem);

      const { result } = renderHook(() => useMarkPaid(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(1);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(financesApi.markPaid).toHaveBeenCalledWith(1);
    });
  });
});
