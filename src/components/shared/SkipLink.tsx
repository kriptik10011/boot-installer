/**
 * SkipLink — "Skip to main content" accessibility link.
 *
 * Visually hidden until focused (sr-only → visible on focus).
 * First focusable element in the DOM for keyboard users.
 */

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200]
                 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-cyan-600 focus:text-white
                 focus:font-semibold focus:text-sm focus:shadow-lg focus:outline-none
                 focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900"
    >
      Skip to main content
    </a>
  );
}
