/**
 * WeekBillsCard Tests
 *
 * Covers: circular rendering, hero total, subtitle, pill column.
 * Cards use registry adapters — mocks target adapter layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeekBillsCard } from '@/components/finance/radial/cards/week/WeekBillsCard';
import type { ReactNode } from 'react';

// ── Mock adapters ───────────────────────────────────────────────────────────

vi.mock('@/components/finance/radial/registry/adapters/weekAdapters', () => ({
  useWeekBillTotalAdapter: vi.fn(() => ({
    value: '$1.3K',
    label: 'BILLS',
    sublabel: '3 upcoming',
    color: '#a78bfa',
  })),
  useUpcomingBillsAdapter: vi.fn(() => ({
    items: [
      { label: 'Rent', badge: '2d ago', dotColor: '#d97706' },
      { label: 'Internet', badge: '1d', dotColor: '#f59e0b' },
      { label: 'Gym', badge: '4d', dotColor: '#94a3b8' },
    ],
    header: 'Bills Due',
    headerColor: '#a78bfa',
    emptyMessage: 'No bills due',
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

describe('WeekBillsCard (circular)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders total upcoming as hero', () => {
    render(<WeekBillsCard />, { wrapper: createWrapper() });
    expect(screen.getByText('$1.3K')).toBeTruthy();
  });

  it('renders BILLS label', () => {
    render(<WeekBillsCard />, { wrapper: createWrapper() });
    expect(screen.getByText('BILLS')).toBeTruthy();
  });

  it('renders upcoming count in subtitle', () => {
    render(<WeekBillsCard />, { wrapper: createWrapper() });
    expect(screen.getByText('3 upcoming')).toBeTruthy();
  });

  it('renders DUE SOON column header', () => {
    render(<WeekBillsCard />, { wrapper: createWrapper() });
    expect(screen.getByText('DUE SOON')).toBeTruthy();
  });

  it('renders top bill names in pill column', () => {
    render(<WeekBillsCard />, { wrapper: createWrapper() });
    expect(screen.getByText(/Rent/)).toBeTruthy();
    expect(screen.getByText(/Internet/)).toBeTruthy();
  });
});
