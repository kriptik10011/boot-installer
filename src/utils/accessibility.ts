/**
 * Accessibility Utilities — WCAG AA compliance helpers
 *
 * Focus trapping for modals, screen reader announcements, keyboard handling.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Trap keyboard focus within a container element.
 * Returns a cleanup function to remove the event listener.
 */
export function trapFocus(container: HTMLElement): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.offsetParent !== null);

    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}

/**
 * Announce a message to screen readers via the live region.
 */
export function announceToScreenReader(message: string): void {
  const announcer = document.getElementById('a11y-announcer');
  if (!announcer) return;

  announcer.textContent = '';
  // Force re-announcement by clearing then setting after a microtask
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

/**
 * Standard keyboard handler for modal dialogs.
 * Closes on Escape key press.
 */
export function handleModalKeyDown(
  e: KeyboardEvent | React.KeyboardEvent,
  onClose: () => void
): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }
}
