/**
 * PanelSkeleton Component
 *
 * Loading skeleton matching the right-sliding ContextPanel layout.
 * Displayed inside panel content area while data is loading.
 *
 * Matches ContextPanel structure:
 * - Header skeleton (title area — the ContextPanel chrome renders its own header,
 *   so this skeleton is for the inner content area only)
 * - 4-5 content rows with mixed widths for natural look
 */

import { Skeleton } from '@/components/shared/Skeleton';

export function PanelSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Section 1: Title-like area */}
      <div className="space-y-3">
        <Skeleton variant="text" width="w-3/4" height="h-5" />
        <Skeleton variant="text" width="w-1/2" height="h-4" />
      </div>

      {/* Section 2: Form-like fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton variant="text" width="w-20" height="h-3" />
          <Skeleton variant="rect" width="w-full" height="h-10" />
        </div>
        <div className="space-y-2">
          <Skeleton variant="text" width="w-24" height="h-3" />
          <Skeleton variant="rect" width="w-full" height="h-10" />
        </div>
        <div className="space-y-2">
          <Skeleton variant="text" width="w-16" height="h-3" />
          <Skeleton variant="rect" width="w-full" height="h-24" />
        </div>
      </div>

      {/* Section 3: Action area */}
      <div className="flex gap-3 pt-2">
        <Skeleton variant="rect" width="w-24" height="h-9" />
        <Skeleton variant="rect" width="w-20" height="h-9" />
      </div>
    </div>
  );
}
