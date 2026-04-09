import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { request } from '@/api/core';

/**
 * Polls /auth/session/status every 30s while authenticated.
 * Keeps the idle timer alive so the 5-min timeout doesn't fire
 * while the app is open. On 401, existing auto-logout fires.
 */
export function useSessionHeartbeat() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!isAuthenticated) return;

    const ping = () => {
      request('/auth/session/status').catch(() => {});
    };

    intervalRef.current = setInterval(ping, 30_000);
    return () => clearInterval(intervalRef.current);
  }, [isAuthenticated]);
}
