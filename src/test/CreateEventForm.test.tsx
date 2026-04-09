/**
 * CreateEventForm Tests
 *
 * Covers: rendering, input validation, submission, recurrence picker,
 * error handling, loading state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateEventForm } from '@/components/finance/radial/cards/week/CreateEventForm';
import type { ReactNode } from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockCreateEventMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
const mockCreateRecurrenceRuleMutateAsync = vi.fn().mockResolvedValue({ id: 10 });
const mockDeleteRecurrenceRuleMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockAddToast = vi.fn();

vi.mock('@/hooks', () => ({
  useCreateEvent: vi.fn(() => ({ mutateAsync: mockCreateEventMutateAsync })),
}));

vi.mock('@/hooks/useRecurrence', () => ({
  useCreateRecurrenceRule: vi.fn(() => ({ mutateAsync: mockCreateRecurrenceRuleMutateAsync })),
  useDeleteRecurrenceRule: vi.fn(() => ({ mutateAsync: mockDeleteRecurrenceRuleMutateAsync })),
}));

vi.mock('@/stores/toastStore', () => ({
  useToastStore: vi.fn((selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast })
  ),
}));

vi.mock('@/utils/dateUtils', () => ({
  addDays: vi.fn((d: string, n: number) => '2026-03-01'),
}));

// Stub RecurrencePicker — just renders a toggle
vi.mock('@/components/shared/RecurrencePicker', () => ({
  RecurrencePicker: vi.fn(({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) => (
    <button data-testid="recurrence-toggle" onClick={() => onChange(value ? null : { frequency: 'weekly' })}>
      {value ? 'Recurrence ON' : 'Recurrence OFF'}
    </button>
  )),
}));

const WEEK_DATES = ['2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01'];

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('CreateEventForm', () => {
  const onCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders name input with placeholder', () => {
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay={null} today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByPlaceholderText('Event name')).toBeTruthy();
  });

  it('renders date, time, and location inputs', () => {
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay={null} today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByPlaceholderText('Location (optional)')).toBeTruthy();
    // Date and time inputs exist
    const dateInput = screen.getByDisplayValue('2026-02-23');
    expect(dateInput).toBeTruthy();
  });

  it('disables Add Event button when name is empty', () => {
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay={null} today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );
    const btn = screen.getByText('Add Event');
    expect(btn).toHaveAttribute('disabled');
  });

  it('enables Add Event button when name is filled', () => {
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay={null} today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );
    const nameInput = screen.getByPlaceholderText('Event name');
    fireEvent.change(nameInput, { target: { value: 'Team Lunch' } });
    const btn = screen.getByText('Add Event');
    expect(btn).not.toHaveAttribute('disabled');
  });

  it('calls createEvent on submit and fires onCreated', async () => {
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay={null} today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );
    const nameInput = screen.getByPlaceholderText('Event name');
    fireEvent.change(nameInput, { target: { value: 'Team Lunch' } });
    fireEvent.click(screen.getByText('Add Event'));

    await waitFor(() => {
      expect(mockCreateEventMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Team Lunch', date: '2026-02-23' }),
      );
    });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: expect.stringContaining('Team Lunch') }),
    );
  });

  it('uses filterDay as default date when provided', () => {
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay="2026-02-25" today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );
    const dateInput = screen.getByDisplayValue('2026-02-25');
    expect(dateInput).toBeTruthy();
  });

  it('shows error toast on create failure', async () => {
    mockCreateEventMutateAsync.mockRejectedValueOnce(new Error('fail'));
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay={null} today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );
    const nameInput = screen.getByPlaceholderText('Event name');
    fireEvent.change(nameInput, { target: { value: 'Fail Event' } });
    fireEvent.click(screen.getByText('Add Event'));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: 'Failed to create event' }),
      );
    });

    expect(onCreated).not.toHaveBeenCalled();
  });

  it('truncates name input at 100 characters', () => {
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay={null} today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );
    const nameInput = screen.getByPlaceholderText('Event name') as HTMLInputElement;
    const longName = 'A'.repeat(120);
    fireEvent.change(nameInput, { target: { value: longName } });
    expect(nameInput.value.length).toBeLessThanOrEqual(100);
  });

  it('renders RecurrencePicker', () => {
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay={null} today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByTestId('recurrence-toggle')).toBeTruthy();
  });

  it('creates recurrence rule when recurrence is set', async () => {
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay={null} today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );

    // Enable recurrence
    fireEvent.click(screen.getByTestId('recurrence-toggle'));
    expect(screen.getByText('Recurrence ON')).toBeTruthy();

    // Fill name and submit
    fireEvent.change(screen.getByPlaceholderText('Event name'), { target: { value: 'Weekly Sync' } });
    fireEvent.click(screen.getByText('Add Event'));

    await waitFor(() => {
      expect(mockCreateRecurrenceRuleMutateAsync).toHaveBeenCalledWith({ frequency: 'weekly' });
    });

    await waitFor(() => {
      expect(mockCreateEventMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Weekly Sync', recurrence_rule_id: 10 }),
      );
    });
  });

  it('cleans up recurrence rule if event creation fails', async () => {
    mockCreateEventMutateAsync.mockRejectedValueOnce(new Error('event fail'));
    render(
      <CreateEventForm weekDates={WEEK_DATES} filterDay={null} today="2026-02-23" weekStart="2026-02-23" onCreated={onCreated} />,
      { wrapper: createWrapper() },
    );

    // Enable recurrence
    fireEvent.click(screen.getByTestId('recurrence-toggle'));

    // Fill name and submit
    fireEvent.change(screen.getByPlaceholderText('Event name'), { target: { value: 'Doomed Event' } });
    fireEvent.click(screen.getByText('Add Event'));

    await waitFor(() => {
      expect(mockDeleteRecurrenceRuleMutateAsync).toHaveBeenCalledWith(10);
    });
  });
});
