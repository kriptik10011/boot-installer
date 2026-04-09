/**
 * Toast Store Tests
 *
 * Unit tests for the Zustand toast notification store.
 * Covers add, remove, auto-dismiss, max visible enforcement, and timeout cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useToastStore } from '@/stores/toastStore';

describe('Toast Store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store state between tests
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a toast with unique id and createdAt', () => {
    const id = useToastStore.getState().addToast({
      message: 'Item saved',
      type: 'success',
      durationMs: 4000,
    });

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(id);
    expect(toasts[0].message).toBe('Item saved');
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].createdAt).toBeGreaterThan(0);
  });

  it('generates unique IDs for each toast', () => {
    const id1 = useToastStore.getState().addToast({
      message: 'Toast 1',
      type: 'success',
      durationMs: 4000,
    });
    const id2 = useToastStore.getState().addToast({
      message: 'Toast 2',
      type: 'error',
      durationMs: 4000,
    });

    expect(id1).not.toBe(id2);
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it('auto-removes toast after durationMs', () => {
    useToastStore.getState().addToast({
      message: 'Disappearing soon',
      type: 'success',
      durationMs: 3000,
    });

    expect(useToastStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(3000);

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does not auto-remove before durationMs expires', () => {
    useToastStore.getState().addToast({
      message: 'Still here',
      type: 'success',
      durationMs: 5000,
    });

    vi.advanceTimersByTime(4999);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('enforces max 3 visible toasts (trims oldest)', () => {
    const { addToast } = useToastStore.getState();
    addToast({ message: 'Toast 1', type: 'success', durationMs: 10000 });
    addToast({ message: 'Toast 2', type: 'success', durationMs: 10000 });
    addToast({ message: 'Toast 3', type: 'success', durationMs: 10000 });

    expect(useToastStore.getState().toasts).toHaveLength(3);

    addToast({ message: 'Toast 4', type: 'success', durationMs: 10000 });

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(3);
    // Oldest (Toast 1) should be gone
    expect(toasts[0].message).toBe('Toast 2');
    expect(toasts[2].message).toBe('Toast 4');
  });

  it('removes toast by id', () => {
    const id = useToastStore.getState().addToast({
      message: 'To be removed',
      type: 'error',
      durationMs: 10000,
    });

    expect(useToastStore.getState().toasts).toHaveLength(1);

    useToastStore.getState().removeToast(id);

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('clears auto-dismiss timeout when toast manually removed', () => {
    const id = useToastStore.getState().addToast({
      message: 'Manual dismiss',
      type: 'success',
      durationMs: 5000,
    });

    // Manually remove before timeout
    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);

    // Advance past original timeout — should not error or re-add
    vi.advanceTimersByTime(5000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('handles removing non-existent toast gracefully', () => {
    useToastStore.getState().removeToast('non-existent-id');
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('preserves undoAction on undo toasts', () => {
    const undoFn = vi.fn();
    useToastStore.getState().addToast({
      message: 'Deleted item',
      type: 'undo',
      durationMs: 5000,
      undoAction: undoFn,
    });

    const { toasts } = useToastStore.getState();
    expect(toasts[0].undoAction).toBe(undoFn);
  });
});
