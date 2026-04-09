/**
 * useUndoDelete — Generic undo-delete hook
 *
 * Flow:
 * 1. Stores item snapshot
 * 2. Optimistically removes item from TanStack cache
 * 3. Shows undo toast (5s countdown)
 * 4. If undo clicked: restores item in cache, cancels delete
 * 5. If timeout expires: fires real DELETE API call
 */

import { useRef, useCallback, useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToastStore } from '@/stores/toastStore';

const UNDO_DURATION_MS = 5000;

interface PendingDelete<T> {
  item: T;
  toastId: string;
  timeoutId: ReturnType<typeof setTimeout>;
  cancelled: boolean;
}

interface UseUndoDeleteOptions<T> {
  /** Label for the entity type shown in toast (e.g., "item", "event") */
  entityLabel: string;
  /** Function to get item name for display */
  getItemName: (item: T) => string;
  /** Function to get item id */
  getItemId: (item: T) => number;
  /** TanStack query keys to optimistically update (list queries) */
  listQueryKeys: QueryKey[];
  /** Function to fire the real delete */
  deleteFn: (id: number) => Promise<unknown>;
  /** Additional query keys to invalidate after real delete */
  invalidateKeys?: QueryKey[];
}

export function useUndoDelete<T>(options: UseUndoDeleteOptions<T>) {
  const {
    entityLabel,
    getItemName,
    getItemId,
    listQueryKeys,
    deleteFn,
    invalidateKeys = [],
  } = options;

  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const removeToast = useToastStore((s) => s.removeToast);
  const pendingRef = useRef<Map<number, PendingDelete<T>>>(new Map());

  // Cleanup on unmount — clear all pending timeouts to prevent memory leaks
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((pending) => {
        clearTimeout(pending.timeoutId);
      });
      pendingRef.current.clear();
    };
  }, []);

  const requestDelete = useCallback((item: T) => {
    const id = getItemId(item);
    const name = getItemName(item);

    // If there's already a pending delete for this item, skip
    if (pendingRef.current.has(id)) return;

    // 1. Snapshot current cache data for restoration
    const snapshots: Array<{ key: QueryKey; data: unknown }> = [];
    for (const key of listQueryKeys) {
      const data = queryClient.getQueryData(key);
      if (data !== undefined) {
        snapshots.push({ key, data });
      }
    }

    // 2. Optimistically remove from cache
    for (const key of listQueryKeys) {
      queryClient.setQueryData(key, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.filter((entry: T) => getItemId(entry) !== id);
      });
    }

    // 3. Set up delayed real delete
    const pending: PendingDelete<T> = {
      item,
      toastId: '',
      timeoutId: setTimeout(async () => {
        const p = pendingRef.current.get(id);
        if (p && !p.cancelled) {
          pendingRef.current.delete(id);
          try {
            await deleteFn(id);
            // Invalidate to get fresh server data
            for (const key of [...listQueryKeys, ...invalidateKeys]) {
              queryClient.invalidateQueries({ queryKey: key });
            }
          } catch {
            // Delete failed — restore from snapshot
            for (const snap of snapshots) {
              queryClient.setQueryData(snap.key, snap.data);
            }
            useToastStore.getState().addToast({
              message: `Failed to delete ${name}`,
              type: 'error',
              durationMs: 4000,
            });
          }
        }
      }, UNDO_DURATION_MS),
      cancelled: false,
    };

    // 4. Show undo toast
    const toastId = addToast({
      message: `Deleted "${name}"`,
      type: 'undo',
      durationMs: UNDO_DURATION_MS,
      undoAction: () => {
        const p = pendingRef.current.get(id);
        if (p) {
          p.cancelled = true;
          clearTimeout(p.timeoutId);
          pendingRef.current.delete(id);
          // Restore cache from snapshots
          for (const snap of snapshots) {
            queryClient.setQueryData(snap.key, snap.data);
          }
          // Remove toast immediately to prevent auto-dismiss confusion
          removeToast(p.toastId);
        }
      },
    });

    pending.toastId = toastId;
    pendingRef.current.set(id, pending);
  }, [queryClient, addToast, removeToast, entityLabel, getItemName, getItemId, listQueryKeys, deleteFn, invalidateKeys]);

  return { requestDelete };
}
