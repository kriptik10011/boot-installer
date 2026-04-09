import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEvents, useWeekEvents } from '../hooks/useEvents';
import { useEventCategories } from '../hooks/useCategories';
import type { Event, EventCategory } from '../types';

// Mock the API client — MUST be before import
vi.mock('../api/client', () => ({
  eventsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getWeek: vi.fn(),
  },
  categoriesApi: {
    eventCategories: vi.fn(),
    recipeCategories: vi.fn(),
    financialCategories: vi.fn(),
  },
}));

import { eventsApi, categoriesApi } from '../api/client';

// Wrapper for hooks that need QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

// Sample test data
const mockEvents: Event[] = [
  {
    id: 1,
    name: 'Team Meeting',
    date: '2026-01-20',
    start_time: '09:00',
    end_time: '10:00',
    location: 'Conference Room A',
    description: 'Weekly sync',
    category_id: 1,
    recurrence_rule_id: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 2,
    name: 'Dentist Appointment',
    date: '2026-01-21',
    start_time: '14:00',
    end_time: '15:00',
    location: null,
    description: null,
    category_id: 2,
    recurrence_rule_id: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
];

const mockCategories: EventCategory[] = [
  { id: 1, name: 'Work', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 2, name: 'Health', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
];

describe('API Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useEvents', () => {
    it('fetches and returns events list', async () => {
      vi.mocked(eventsApi.list).mockResolvedValue(mockEvents);

      const { result } = renderHook(() => useEvents(), {
        wrapper: createWrapper(),
      });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for data
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockEvents);
      expect(eventsApi.list).toHaveBeenCalledTimes(1);
    });
  });

  describe('useWeekEvents', () => {
    it('fetches events for a specific week', async () => {
      vi.mocked(eventsApi.getWeek).mockResolvedValue(mockEvents);

      const { result } = renderHook(() => useWeekEvents('2026-01-19'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockEvents);
      expect(eventsApi.getWeek).toHaveBeenCalledWith('2026-01-19');
    });
  });

  describe('useEventCategories', () => {
    it('fetches and caches event categories', async () => {
      vi.mocked(categoriesApi.eventCategories).mockResolvedValue(mockCategories);

      const { result } = renderHook(() => useEventCategories(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockCategories);
      expect(categoriesApi.eventCategories).toHaveBeenCalledTimes(1);
    });
  });
});
