/**
 * useBackendReady Hook
 *
 * Module-level singleton that tracks whether the backend has ever responded.
 * Uses useSyncExternalStore for React 18 tear-free reads.
 *
 * - `backendReady` starts false, becomes true on first health success
 * - `hasEverConnected` tracks startup vs reconnect (never resets)
 * - Subscribers are notified via useSyncExternalStore pattern
 */

import { useSyncExternalStore } from 'react';

// Module-level singleton state
let backendReady = false;
let hasEverConnected = false;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

/** Called by health polling on first successful response */
export function setBackendReady() {
  if (!backendReady) {
    backendReady = true;
    hasEverConnected = true;
    emitChange();
  }
}

/** Called when backend connection is lost after having been connected */
export function setBackendDisconnected() {
  if (backendReady) {
    backendReady = false;
    emitChange();
  }
}

export function getBackendReady(): boolean {
  return backendReady;
}

export function getHasEverConnected(): boolean {
  return hasEverConnected;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getReadySnapshot(): boolean {
  return backendReady;
}

function getEverConnectedSnapshot(): boolean {
  return hasEverConnected;
}

/**
 * React hook for backend readiness.
 * Returns true once backend has responded to at least one health check.
 */
export function useBackendReady(): boolean {
  return useSyncExternalStore(subscribe, getReadySnapshot, getReadySnapshot);
}

/**
 * React hook for "has ever connected" state.
 * Returns true after first successful connection (never resets to false).
 * Used to distinguish startup (never connected) from reconnect (lost connection).
 */
export function useHasEverConnected(): boolean {
  return useSyncExternalStore(subscribe, getEverConnectedSnapshot, getEverConnectedSnapshot);
}
