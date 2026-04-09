/**
 * WeekEventsCard Tests
 *
 * Covers: circular rendering, hero count, subtitle, upcoming events pill.
 * Cards use registry adapters — mocks target adapter layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeekEventsCard } from '@/components/finance/radial/cards/week/WeekEventsCard';
import type { ReactNode } from 'react';

// ── Mock adapters ───────────────────────────────────────────────────────────

vi.mock('@/components/finance/radial/registry/adapters/weekAdapters', () => ({
  useWeekEventCountAdapter: vi.fn(() => ({
    value: 3,
    label: 'EVENTS',
    sublabel: '2 today',
    color: '#22d3ee',
  })),
  useUpcomingEventsAdapter: vi.fn(() => ({
    items: [
      { label: 'Team Standup', badge: '09:00', dotColor: '#22d3ee' },
      { label: 'Lunch Meeting', badge: '12:00', dotColor: '#22d3ee' },
      { label: 'Gym', badge: '18:00', dotColor: '#22d3ee' },
    ],
    header: 'Events',
    headerColor: '#22d3ee',
    emptyMessage: 'No events',
    maxItems: 3,
  })),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: vi.fn((selector: (s: { latticePrefs: { cardShape: string } }) => unknown) =>
    selector({ latticePrefs: { cardShape: 'circular' } })
  ),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('WeekEventsCard (circular)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders total event count as hero', () => {
    render(<WeekEventsCard />, { wrapper: createWrapper() });
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('renders EVENTS label', () => {
    render(<WeekEventsCard />, { wrapper: createWrapper() });
    expect(screen.getByText('EVENTS')).toBeTruthy();
  });

  it('renders today status in subtitle', () => {
    render(<WeekEventsCard />, { wrapper: createWrapper() });
    expect(screen.getByText('2 today')).toBeTruthy();
  });

  it('renders UPCOMING column header', () => {
    render(<WeekEventsCard />, { wrapper: createWrapper() });
    expect(screen.getByText('UPCOMING')).toBeTruthy();
  });

  it('renders upcoming event names', () => {
    render(<WeekEventsCard />, { wrapper: createWrapper() });
    expect(screen.getByText(/Team Standup/)).toBeTruthy();
  });
});
