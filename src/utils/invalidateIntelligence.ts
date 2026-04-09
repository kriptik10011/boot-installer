/**
 * Centralized intelligence cache invalidation.
 *
 * Every CRUD mutation that modifies domain data must call this to ensure
 * intelligence-powered cards show fresh data. Without this, users see
 * stale intelligence data after create/edit/delete until staleTime expires.
 *
 * Always invalidates both the domain-specific and cross-feature caches,
 * because cross-feature intelligence composites multiple domain computations.
 */

import type { QueryClient } from '@tanstack/react-query';

type IntelligenceDomain = 'finance' | 'events' | 'meals' | 'inventory' | 'recipes';

export function invalidateIntelligence(qc: QueryClient, domain: IntelligenceDomain): void {
  qc.invalidateQueries({ queryKey: ['intelligence', domain] });
  qc.invalidateQueries({ queryKey: ['intelligence', 'cross-feature'] });
}
