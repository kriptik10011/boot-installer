/**
 * WeekViewSkeleton Component
 *
 * Loading skeleton matching the 7-column DayCard grid layout.
 * Displayed while week data (events, meals, bills) is loading.
 *
 * Matches DayCard structure:
 * - Rounded card with border
 * - Header bar (day name + number)
 * - Events section (label + 1-2 item placeholders)
 * - Meals section (label + 3 slot placeholders)
 * - min-h-[300px] to match DayCard
 */

import { Skeleton } from '@/components/shared/Skeleton';

/** Single day card skeleton matching DayCard layout */
function DayCardSkeleton() {
  return (
    <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 overflow-hidden flex flex-col min-h-[300px]">
      {/* Day Header — matches DayCard header area */}
      <div className="px-4 py-3 border-b border-slate-700/50">
        <Skeleton variant="text" width="w-12" height="h-3" className="mb-2" />
        <Skeleton variant="text" width="w-8" height="h-6" />
      </div>

      {/* Card Content */}
      <div className="flex-1 p-3 space-y-4">
        {/* Events Section */}
        <div className="space-y-2">
          <Skeleton variant="text" width="w-14" height="h-3" />
          <Skeleton variant="rect" width="w-full" height="h-9" />
          <Skeleton variant="rect" width="w-full" height="h-9" />
        </div>

        {/* Meals Section */}
        <div className="space-y-2">
          <Skeleton variant="text" width="w-12" height="h-3" />
          <Skeleton variant="rect" width="w-full" height="h-9" />
          <Skeleton variant="rect" width="w-full" height="h-9" />
          <Skeleton variant="rect" width="w-full" height="h-9" />
        </div>
      </div>
    </div>
  );
}

/** Header skeleton matching WeekHeader navigation area */
function WeekHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-900/80">
      {/* Left: Week navigation area */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Skeleton variant="rect" width="w-9" height="h-9" />
          <Skeleton variant="rect" width="w-16" height="h-8" />
          <Skeleton variant="rect" width="w-9" height="h-9" />
        </div>
        <Skeleton variant="text" width="w-48" height="h-5" />
      </div>

      {/* Center: Health indicators area */}
      <div className="flex items-center gap-3">
        <Skeleton variant="rect" width="w-32" height="h-7" className="rounded-full" />
      </div>

      {/* Right: Action buttons area */}
      <div className="flex items-center gap-3">
        <Skeleton variant="rect" width="w-20" height="h-8" />
        <Skeleton variant="rect" width="w-9" height="h-9" />
        <Skeleton variant="rect" width="w-9" height="h-9" />
        <Skeleton variant="rect" width="w-9" height="h-9" />
      </div>
    </div>
  );
}

export function WeekViewSkeleton() {
  return (
    <div className="min-h-screen bg-slate-900">
      <WeekHeaderSkeleton />
      <main className="p-6">
        <div className="grid grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <DayCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
