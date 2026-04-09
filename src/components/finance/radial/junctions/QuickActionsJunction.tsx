/**
 * QuickActionsJunction — NE junction. Weekly Review wizard only.
 * QuickLog and HabitCheckIn were deleted — they duplicated arc card actions
 * and the SE HabitJunction respectively.
 */

import { lazy } from 'react';

const WeeklyReviewWizardWidget = lazy(() =>
  import('@/components/week/WeeklyReviewWizard')
    .then((m) => ({ default: m.WeeklyReviewWizardWidget }))
);

export { WeeklyReviewWizardWidget };
