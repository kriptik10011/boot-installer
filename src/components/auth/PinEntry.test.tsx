/**
 * PinEntry.test.tsx — Verify PIN auto-submit at correct length (6 digits).
 *
 * PinEntry auto-submits after exactly PIN_LENGTH (6) digits.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PinEntry } from './PinEntry';

// Mock the auth store functions
const mockAttemptLogin = vi.fn();
vi.mock('@/stores/authStore', () => ({
  attemptLogin: (...args: unknown[]) => mockAttemptLogin(...args),
  useAuthStore: vi.fn(() => ({ login: vi.fn() })),
}));

describe('PinEntry PIN length', () => {
  beforeEach(() => {
    mockAttemptLogin.mockReset();
    mockAttemptLogin.mockResolvedValue({
      ok: true,
      data: { token: 'test-token', user_id: 'user-123', username: 'TestUser' },
    });
  });

  it('auto-submits after 6 digits (PIN_LENGTH)', async () => {
    const onSuccess = vi.fn();

    render(
      <PinEntry
        userId="user-123"
        username="TestUser"
        onSuccess={onSuccess}
        onBack={vi.fn()}
      />
    );

    // Click 6 digit buttons
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('6'));

    // Should have called attemptLogin after 6 digits
    await waitFor(() => {
      expect(mockAttemptLogin).toHaveBeenCalledWith('user-123', '123456');
    });
  });

  it('does NOT auto-submit after only 5 digits', () => {
    render(
      <PinEntry
        userId="user-123"
        username="TestUser"
        onSuccess={vi.fn()}
        onBack={vi.fn()}
      />
    );

    // Click only 5 digit buttons
    for (let i = 1; i <= 5; i++) {
      fireEvent.click(screen.getByText(String(i)));
    }

    // Should NOT have called attemptLogin yet
    expect(mockAttemptLogin).not.toHaveBeenCalled();
  });
});
