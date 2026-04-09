/**
 * useObservations — Hooks for insight dismissal/action logging.
 *
 * Communicates with the observation learning backend to track
 * which insights users dismiss or act on.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '@/api/core';
import { useBackendReady } from './useBackendReady';

const observationKeys = {
  suppressed: ['observations', 'suppressed'] as const,
};

export function useLogDismissal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ insightType, context }: { insightType: string; context?: string }) =>
      request<{ count: number; suppressed: boolean }>('/observation/insight-dismissed', {
        method: 'POST',
        body: { insight_type: insightType, context: context ?? 'global' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: observationKeys.suppressed });
    },
  });
}

export function useLogAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      insightType,
      action,
      outcome,
    }: {
      insightType: string;
      action: string;
      outcome?: string;
    }) =>
      request<{ confidence_boost: number }>('/observation/insight-acted', {
        method: 'POST',
        body: { insight_type: insightType, action, outcome },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: observationKeys.suppressed });
    },
  });
}

export function useSuppressedPatterns() {
  const backendReady = useBackendReady();

  return useQuery({
    queryKey: observationKeys.suppressed,
    queryFn: () =>
      request<{ suppressed: Array<{ insight_type: string; context: string; count: number }> }>(
        '/observation/suppressed-patterns'
      ),
    staleTime: 5 * 60 * 1000,
    enabled: backendReady,
  });
}
