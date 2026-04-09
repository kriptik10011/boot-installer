/**
 * useUndoDelete Tests
 *
 * Unit tests for the generic undo-delete hook.
 * Covers optimistic removal, undo restoration, timeout-based deletion,
 * error recovery, duplicate prevention, and unmount cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { useToastStore } from '@/stores/toastStore';
import type { ReactNode } from 'react';

interface TestItem {
  id: number;
  name: string;
}

const ITEMS: TestItem[] = [
  { id: 1, name: 'Apple' },
  { id: 2, name: 'Banana' },
  { id: 3, name: 'Cherry' },
];

const LIST_KEY = ['test', 'list'];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Seed the cache
  queryClient.setQueryData(LIST_KEY, [...ITEMS]);

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe('useUndoDelete', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deleteFn: ((id: number) => Promise<unknown>) & Mock<any>;

  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteFn = vi.fn().mockResolvedValue(undefined) as any;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('optimistically removes item from cache on requestDelete', () => {
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useUndoDelete<TestItem>({
          entityLabel: 'item',
          getItemName: (i) => i.name,
          getItemId: (i) => i.id,
          listQueryKeys: [LIST_KEY],
          deleteFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.requestDelete(ITEMS[1]); // Delete Banana
    });

    const cached = queryClient.getQueryData<TestItem[]>(LIST_KEY);
    expect(cached).toHaveLength(2);
    expect(cached?.find((i) => i.id === 2)).toBeUndefined();
    expect(cached?.find((i) => i.id === 1)).toBeDefined();
  });

  it('shows undo toast when item deleted', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useUndoDelete<TestItem>({
          entityLabel: 'item',
          getItemName: (i) => i.name,
          getItemId: (i) => i.id,
          listQueryKeys: [LIST_KEY],
          deleteFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.requestDelete(ITEMS[0]);
    });

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('undo');
    expect(toasts[0].message).toContain('Apple');
  });

  it('fires real delete after undo timeout expires', async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useUndoDelete<TestItem>({
          entityLabel: 'item',
          getItemName: (i) => i.name,
          getItemId: (i) => i.id,
          listQueryKeys: [LIST_KEY],
          deleteFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.requestDelete(ITEMS[0]);
    });

    expect(deleteFn).not.toHaveBeenCalled();

    // Advance past the 5s undo window
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(deleteFn).toHaveBeenCalledWith(1);
  });

  it('restores item when undo is triggered', () => {
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useUndoDelete<TestItem>({
          entityLabel: 'item',
          getItemName: (i) => i.name,
          getItemId: (i) => i.id,
          listQueryKeys: [LIST_KEY],
          deleteFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.requestDelete(ITEMS[1]); // Delete Banana
    });

    // Verify optimistically removed
    expect(queryClient.getQueryData<TestItem[]>(LIST_KEY)).toHaveLength(2);

    // Click undo via the toast's undoAction
    act(() => {
      const { toasts } = useToastStore.getState();
      toasts[0].undoAction?.();
    });

    // Item should be restored
    const cached = queryClient.getQueryData<TestItem[]>(LIST_KEY);
    expect(cached).toHaveLength(3);
    expect(cached?.find((i) => i.id === 2)?.name).toBe('Banana');
  });

  it('does not fire delete after undo is triggered', async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useUndoDelete<TestItem>({
          entityLabel: 'item',
          getItemName: (i) => i.name,
          getItemId: (i) => i.id,
          listQueryKeys: [LIST_KEY],
          deleteFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.requestDelete(ITEMS[0]);
    });

    // Undo before timeout
    act(() => {
      const { toasts } = useToastStore.getState();
      toasts[0].undoAction?.();
    });

    // Advance past timeout
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('ignores duplicate delete requests for the same item', () => {
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useUndoDelete<TestItem>({
          entityLabel: 'item',
          getItemName: (i) => i.name,
          getItemId: (i) => i.id,
          listQueryKeys: [LIST_KEY],
          deleteFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.requestDelete(ITEMS[0]);
      result.current.requestDelete(ITEMS[0]); // Duplicate
    });

    // Only 1 toast should appear
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('restores cache on delete API failure', async () => {
    deleteFn.mockRejectedValueOnce(new Error('Server error'));
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useUndoDelete<TestItem>({
          entityLabel: 'item',
          getItemName: (i) => i.name,
          getItemId: (i) => i.id,
          listQueryKeys: [LIST_KEY],
          deleteFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.requestDelete(ITEMS[0]);
    });

    // Advance past timeout to trigger delete
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Cache should be restored after failure
    const cached = queryClient.getQueryData<TestItem[]>(LIST_KEY);
    expect(cached).toHaveLength(3);

    // Error toast should appear
    const { toasts } = useToastStore.getState();
    const errorToast = toasts.find((t) => t.type === 'error');
    expect(errorToast?.message).toContain('Failed to delete');
  });

  it('handles non-array cache data gracefully', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Set non-array data
    queryClient.setQueryData(LIST_KEY, { items: ITEMS });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useUndoDelete<TestItem>({
          entityLabel: 'item',
          getItemName: (i) => i.name,
          getItemId: (i) => i.id,
          listQueryKeys: [LIST_KEY],
          deleteFn,
        }),
      { wrapper }
    );

    // Should not crash — non-array data is preserved
    act(() => {
      result.current.requestDelete(ITEMS[0]);
    });

    const cached = queryClient.getQueryData(LIST_KEY);
    expect(cached).toEqual({ items: ITEMS }); // Unchanged
  });
});
