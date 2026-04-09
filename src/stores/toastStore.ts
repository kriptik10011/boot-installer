/**
 * Toast Store — Zustand store for toast notifications
 *
 * Manages a stack of toast notifications with support for:
 * - Success, error, and undo toast variants
 * - Auto-dismiss with configurable duration
 * - Max 3 visible toasts (oldest auto-dismissed)
 * - Undo action callback for undo toasts
 */

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'undo';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  undoAction?: () => void;
  durationMs: number;
  createdAt: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => string;
  removeToast: (id: string) => void;
}

const MAX_VISIBLE = 3;

let nextId = 0;
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++nextId}-${Date.now()}`;
    const newToast: Toast = {
      ...toast,
      id,
      createdAt: Date.now(),
    };

    set((state) => {
      const updated = [...state.toasts, newToast];
      // Trim oldest if over max
      if (updated.length > MAX_VISIBLE) {
        return { toasts: updated.slice(updated.length - MAX_VISIBLE) };
      }
      return { toasts: updated };
    });

    // Auto-remove after duration (tracked for cleanup)
    const timeoutId = setTimeout(() => {
      timeouts.delete(id);
      get().removeToast(id);
    }, toast.durationMs);
    timeouts.set(id, timeoutId);

    return id;
  },

  removeToast: (id) => {
    // Clear auto-dismiss timeout if it exists
    const timeoutId = timeouts.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeouts.delete(id);
    }

    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
