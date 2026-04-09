/**
 * EventPanel Tests — Part 1 (Create + Loading)
 * Split into small files to avoid vitest worker OOM on Windows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventPanel } from '@/components/panels/EventPanel';

vi.mock('@/hooks/useEvents', () => ({
  useEvent: vi.fn((id: number | null) => {
    if (id === null) return { data: undefined, isLoading: false };
    if (id === 999) return { data: undefined, isLoading: true };
    return {
      data: {
        id: 1, name: 'Team Standup', date: '2026-02-10',
        start_time: '09:00', end_time: '09:30', location: 'Office',
        description: 'Daily standup meeting', recurrence_rule_id: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      isLoading: false,
    };
  }),
  useCreateEvent: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateEvent: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteEvent: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  eventKeys: { all: ['events'], lists: () => ['events', 'list'] },
}));

vi.mock('@/api/client', () => ({
  eventsApi: { delete: vi.fn() },
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

vi.mock('@/utils/dateUtils', () => ({
  getTodayLocal: vi.fn(() => '2026-02-10'),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('EventPanel — Create & Loading', () => {
  const onClose = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders create form when eventId is null', () => {
    render(<EventPanel eventId={null} date="2026-02-10" onClose={onClose} />, { wrapper: createWrapper() });
    expect(screen.getByText('Create Event')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter event name')).toBeTruthy();
  });

  it('shows loading skeleton when fetching event', () => {
    render(<EventPanel eventId={999} date="2026-02-10" onClose={onClose} />, { wrapper: createWrapper() });
    expect(screen.queryByText('Create Event')).toBeNull();
    expect(screen.queryByText('Save Changes')).toBeNull();
  });

  it('renders RecurrencePicker toggle', () => {
    render(<EventPanel eventId={null} date="2026-02-10" onClose={onClose} />, { wrapper: createWrapper() });
    expect(screen.getByText('Repeats')).toBeTruthy();
    expect(screen.getByRole('switch')).toBeTruthy();
  });
});
