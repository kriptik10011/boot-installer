/**
 * RecurrencePicker Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecurrencePicker } from '@/components/shared/RecurrencePicker';
import type { RecurrenceRuleCreate } from '@/types';

describe('RecurrencePicker', () => {
  const onChange = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders toggle off by default when value is null', () => {
    render(<RecurrencePicker value={null} onChange={onChange} />);
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText('Daily')).toBeNull();
  });

  it('toggle on shows frequency chips', () => {
    render(<RecurrencePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ frequency: 'weekly' }));
  });

  it('shows frequency chips when value is provided', () => {
    const value: RecurrenceRuleCreate = {
      frequency: 'weekly', interval: 1, day_of_week: 0,
      day_of_month: null, end_type: 'never', end_count: null, end_date: null,
    };
    render(<RecurrencePicker value={value} onChange={onChange} />);
    expect(screen.getByText('Daily')).toBeTruthy();
    expect(screen.getByText('Weekly')).toBeTruthy();
    expect(screen.getByText('Monthly')).toBeTruthy();
    expect(screen.getByText('Yearly')).toBeTruthy();
  });

  it('selecting Weekly shows day-of-week selector', () => {
    const value: RecurrenceRuleCreate = {
      frequency: 'weekly', interval: 1, day_of_week: 1,
      day_of_month: null, end_type: 'never', end_count: null, end_date: null,
    };
    render(<RecurrencePicker value={value} onChange={onChange} />);
    expect(screen.getByLabelText('Sun')).toBeTruthy();
    expect(screen.getByLabelText('Mon')).toBeTruthy();
    expect(screen.getByLabelText('Sat')).toBeTruthy();
  });

  it('selecting Monthly shows day-of-month input', () => {
    const value: RecurrenceRuleCreate = {
      frequency: 'monthly', interval: 1, day_of_week: null,
      day_of_month: 15, end_type: 'never', end_count: null, end_date: null,
    };
    render(<RecurrencePicker value={value} onChange={onChange} />);
    const input = screen.getByLabelText('On day') as HTMLInputElement;
    expect(input.value).toBe('15');
  });

  it('end condition "After" shows count input', () => {
    const value: RecurrenceRuleCreate = {
      frequency: 'weekly', interval: 1, day_of_week: 1,
      day_of_month: null, end_type: 'count', end_count: 10, end_date: null,
    };
    render(<RecurrencePicker value={value} onChange={onChange} />);
    expect(screen.getByLabelText('times')).toBeTruthy();
  });

  it('end condition "On date" shows date input', () => {
    const value: RecurrenceRuleCreate = {
      frequency: 'weekly', interval: 1, day_of_week: 1,
      day_of_month: null, end_type: 'date', end_count: null, end_date: '2026-12-31',
    };
    render(<RecurrencePicker value={value} onChange={onChange} />);
    expect(screen.getByLabelText('End date')).toBeTruthy();
  });

  it('toggle off calls onChange(null)', () => {
    const value: RecurrenceRuleCreate = {
      frequency: 'weekly', interval: 1, day_of_week: 1,
      day_of_month: null, end_type: 'never', end_count: null, end_date: null,
    };
    render(<RecurrencePicker value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('onChange called with correct shape when frequency changes', () => {
    const value: RecurrenceRuleCreate = {
      frequency: 'weekly', interval: 1, day_of_week: 1,
      day_of_month: null, end_type: 'never', end_count: null, end_date: null,
    };
    render(<RecurrencePicker value={value} onChange={onChange} />);
    fireEvent.click(screen.getByText('Monthly'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: 'monthly', day_of_month: expect.any(Number) })
    );
  });

  it('showBillFrequencies shows extra chips', () => {
    const value: RecurrenceRuleCreate = {
      frequency: 'weekly', interval: 1, day_of_week: 1,
      day_of_month: null, end_type: 'never', end_count: null, end_date: null,
    };
    render(<RecurrencePicker value={value} onChange={onChange} showBillFrequencies />);
    expect(screen.getByText('Biweekly')).toBeTruthy();
    expect(screen.getByText('Quarterly')).toBeTruthy();
  });

  it('frequency chips use radiogroup role', () => {
    const value: RecurrenceRuleCreate = {
      frequency: 'weekly', interval: 1, day_of_week: 1,
      day_of_month: null, end_type: 'never', end_count: null, end_date: null,
    };
    render(<RecurrencePicker value={value} onChange={onChange} />);
    const radiogroups = screen.getAllByRole('radiogroup');
    expect(radiogroups.length).toBeGreaterThanOrEqual(1);
    expect(radiogroups[0].getAttribute('aria-label')).toBe('Recurrence frequency');
  });
});
