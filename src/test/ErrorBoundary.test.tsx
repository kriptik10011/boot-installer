/**
 * ErrorBoundary Tests
 *
 * Tests for the ErrorBoundary component that catches JavaScript exceptions.
 *
 * IMPORTANT: ErrorBoundary does NOT catch:
 * - Components returning null (white screens)
 * - Portal render failures
 * - Async errors in event handlers
 *
 * It DOES catch:
 * - Exceptions thrown during render
 * - Exceptions in lifecycle methods
 * - Exceptions in constructors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Suppress console.error for expected errors in tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Component that throws an error
function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error from ThrowingComponent');
  }
  return <div>Component rendered successfully</div>;
}

// Component that returns null (ErrorBoundary can't catch this)
function NullComponent() {
  return null;
}

describe('ErrorBoundary', () => {
  describe('Error Catching', () => {
    it('displays fallback UI when child throws an exception', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Should show error fallback UI
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('shows error message in fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Should display the error message
      expect(screen.getByText(/Test error from ThrowingComponent/)).toBeInTheDocument();
    });

    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component rendered successfully')).toBeInTheDocument();
    });
  });

  describe('Fallback UI Structure', () => {
    it('fallback UI has proper styling (not white screen)', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Should have content visible
      expect(container.innerHTML.trim()).not.toBe('');

      // Should have error UI elements
      expect(container.querySelector('.bg-slate-900')).toBeInTheDocument();
    });

    it('provides actionable reload option', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Should have a way to recover
      const reloadButton = screen.getByText(/reload|refresh|retry/i);
      expect(reloadButton).toBeInTheDocument();
    });
  });

  describe('Limitations Documentation', () => {
    it('KNOWN LIMITATION: does not catch null returns (white screen risk)', () => {
      // This test documents that ErrorBoundary cannot catch null returns
      const { container } = render(
        <ErrorBoundary>
          <NullComponent />
        </ErrorBoundary>
      );

      // ErrorBoundary passes through - no error UI shown
      // This is a white screen that ErrorBoundary cannot catch!
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();

      // Container has ErrorBoundary but child rendered null
      // This is why we need white-screen-detection tests
      expect(container.innerHTML).toBe('');
    });
  });

  describe('Nested Components', () => {
    it('catches errors from deeply nested children', () => {
      render(
        <ErrorBoundary>
          <div>
            <div>
              <div>
                <ThrowingComponent />
              </div>
            </div>
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('does not affect sibling components in separate ErrorBoundaries', () => {
      render(
        <div>
          <ErrorBoundary>
            <ThrowingComponent />
          </ErrorBoundary>
          <ErrorBoundary>
            <ThrowingComponent shouldThrow={false} />
          </ErrorBoundary>
        </div>
      );

      // First boundary catches error
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      // Second boundary renders normally
      expect(screen.getByText('Component rendered successfully')).toBeInTheDocument();
    });
  });
});
