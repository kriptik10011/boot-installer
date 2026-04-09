/**
 * useViewTracking Hook
 *
 * Automatically tracks view enter/exit for observation layer.
 * Add to any component that represents a distinct view.
 */

import { useEffect } from 'react';
import { enterView, exitView } from '@/services/observation';
import type { ViewName } from '@/types';

export function useViewTracking(viewName: ViewName | string): void {
  useEffect(() => {
    enterView(viewName);

    return () => {
      exitView();
    };
  }, [viewName]);
}
