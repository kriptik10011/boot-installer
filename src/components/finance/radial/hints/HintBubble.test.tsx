/**
 * HintBubble.test.tsx — verify the click handler dismisses the hint and
 * stops event propagation so the radial container click handler does not
 * receive the same event.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HintBubble } from './HintBubble';
import type { HintDefinition } from './hintCatalog';

const HINT: HintDefinition = {
  id: 'test-hint',
  message: 'Test hint message',
  context: 'radial-root',
  trigger: 'always',
  autoDismissMs: 0,
  variant: 'info',
  priority: 1,
};

describe('HintBubble click dismissal', () => {
  it('calls onDismiss with permanent=true when clicked', () => {
    const onDismiss = vi.fn();
    render(<HintBubble hint={HINT} onDismiss={onDismiss} />);

    const bubble = screen.getByRole('button', { name: /dismiss hint/i });
    fireEvent.click(bubble);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('test-hint', true);
  });

  it('stops click propagation so the radial container handler does not fire', () => {
    const onDismiss = vi.fn();
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <HintBubble hint={HINT} onDismiss={onDismiss} />
      </div>
    );

    const bubble = screen.getByRole('button', { name: /dismiss hint/i });
    fireEvent.click(bubble);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('also fires on pointerdown (gesture systems that consume click)', () => {
    const onDismiss = vi.fn();
    render(<HintBubble hint={HINT} onDismiss={onDismiss} />);

    const bubble = screen.getByRole('button', { name: /dismiss hint/i });
    fireEvent.pointerDown(bubble);

    expect(onDismiss).toHaveBeenCalledWith('test-hint', true);
  });

  it('clears the auto-dismiss timer on manual click', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const hintWithTimer: HintDefinition = { ...HINT, autoDismissMs: 5000 };

    render(<HintBubble hint={hintWithTimer} onDismiss={onDismiss} />);

    const bubble = screen.getByRole('button', { name: /dismiss hint/i });
    fireEvent.click(bubble);

    // Click fired with permanent=true
    expect(onDismiss).toHaveBeenCalledWith('test-hint', true);

    // Advance past the auto-dismiss window — should NOT fire again
    vi.advanceTimersByTime(10000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
