/**
 * useBackendHealth Hook
 *
 * Two-phase health polling:
 * - Rapid phase (200ms interval) during startup until first success
 * - Slow phase (30s interval) after first success
 *
 * Integrates with useBackendReady singleton for query gating.
 * Uses plain fetch + setInterval (not TanStack Query) since this is a heartbeat.
 *
 * `startHealthPolling()` is called pre-render from main.tsx for earliest possible
 * backend detection. The React hook attaches to the same singleton state.
 */

import { useState, useEffect, useCallback } from 'react';
import { config } from '@/config';
import {
  setBackendReady,
  setBackendDisconnected,
  getBackendReady,
  useBackendReady,
} from './useBackendReady';

const HEALTH_URL = `${config.api.baseUrl}/health`;
const RAPID_INTERVAL_MS = 200;
const SLOW_INTERVAL_MS = 30_000;
const MAX_RAPID_POLLS = 50; // 10s safety cap
const DISCONNECT_THRESHOLD = 3; // consecutive failures before marking disconnected

export interface BackendHealthState {
  isConnected: boolean;
  lastSuccessfulPing: Date | null;
  checkNow: () => Promise<void>;
}

// Module-level polling state (shared between startHealthPolling and hook)
let pollingStarted = false;
let rapidPollCount = 0;
let consecutiveFailures = 0;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let queryClientRef: { invalidateQueries: () => void } | null = null;

async function performHealthCheck(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function switchToSlowPolling() {
  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
  }
  pollingInterval = setInterval(async () => {
    const ok = await performHealthCheck();
    if (ok) {
      consecutiveFailures = 0;
      setBackendReady();
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= DISCONNECT_THRESHOLD) {
        setBackendDisconnected();
      }
    }
  }, SLOW_INTERVAL_MS);
}

async function rapidPoll() {
  rapidPollCount++;
  const ok = await performHealthCheck();

  if (ok) {
    // First success: transition to slow polling
    setBackendReady();
    switchToSlowPolling();
    // Wake all gated queries
    if (queryClientRef) {
      queryClientRef.invalidateQueries();
    }
    return;
  }

  // Safety cap: give up rapid polling after MAX_RAPID_POLLS
  if (rapidPollCount >= MAX_RAPID_POLLS) {
    switchToSlowPolling();
  }
}

/**
 * Start health polling BEFORE React renders.
 * Called from main.tsx to detect backend as early as possible.
 */
export function startHealthPolling(queryClient: { invalidateQueries: () => void }) {
  if (pollingStarted) return;
  pollingStarted = true;
  queryClientRef = queryClient;

  // Start rapid polling
  pollingInterval = setInterval(rapidPoll, RAPID_INTERVAL_MS);
  // Also fire immediately
  rapidPoll();
}

/**
 * Reset module-level polling state. Call during HMR or test teardown.
 */
export function resetHealthPolling() {
  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  pollingStarted = false;
  rapidPollCount = 0;
  consecutiveFailures = 0;
  queryClientRef = null;
}

// HMR cleanup: stop polling when module is replaced
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resetHealthPolling();
  });
}

export function useBackendHealth(): BackendHealthState {
  // Subscribe to singleton via useSyncExternalStore (tear-free, no polling)
  const isConnected = useBackendReady();
  const [lastSuccessfulPing, setLastSuccessfulPing] = useState<Date | null>(null);

  useEffect(() => {
    if (isConnected) {
      setLastSuccessfulPing(new Date());
    }
  }, [isConnected]);

  const checkNow = useCallback(async () => {
    const ok = await performHealthCheck();
    if (ok) {
      consecutiveFailures = 0;
      setBackendReady();
      setLastSuccessfulPing(new Date());
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= DISCONNECT_THRESHOLD) {
        setBackendDisconnected();
      }
    }
  }, []);

  return {
    isConnected,
    lastSuccessfulPing,
    checkNow,
  };
}
