/**
 * Observation Service
 *
 * Passive observation tracking for learning user patterns.
 * All data stays local - never sent anywhere.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ViewName } from '@/types';
import { config } from '@/config';
import { getAuthHeaders } from '@/api/core';

// Use centralized config for API URL
const API_BASE = `${config.api.baseUrl}/observation`;

// Session management
let currentSessionId: string | null = null;
let currentView: string | null = null;
let viewEnterTime: number | null = null;
let currentMode: 'living' | 'planning' | null = null;

// Retry queue for failed events
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30000;
interface QueuedEvent extends RecordEventParams {
  retries: number;
  timestamp: number;
}
const retryQueue: QueuedEvent[] = [];
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

export function getSessionId(): string {
  if (!currentSessionId) {
    currentSessionId = uuidv4();
  }
  return currentSessionId;
}

export function startNewSession(): string {
  currentSessionId = uuidv4();
  recordEvent({ event_type: 'app_open' });
  return currentSessionId;
}

export async function endSession(): Promise<void> {
  if (currentSessionId) {
    // Record final view exit
    if (currentView) {
      exitView();
    }

    recordEvent({ event_type: 'app_close' });

    try {
      await fetch(`${API_BASE}/session/end?session_id=${currentSessionId}`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      });
    } catch {
      // Observation endpoint failures must never break the app
    }

    currentSessionId = null;
  }
}

// Mode tracking — every insight event records the user's current mode
export function setMode(mode: 'living' | 'planning' | null): void {
  currentMode = mode;
}

export function getMode(): 'living' | 'planning' | null {
  return currentMode;
}

// Event recording
interface RecordEventParams {
  event_type: string;
  view_name?: string;
  action_name?: string;
  entity_type?: string;
  entity_id?: number;
  metadata?: Record<string, unknown>;
}

// Process retry queue
function processRetryQueue(): void {
  if (retryQueue.length === 0) {
    retryTimeout = null;
    return;
  }

  const event = retryQueue.shift();
  if (event) {
    recordEventInternal(event, true);
  }

  // Schedule next retry - clear existing timeout first to prevent race condition
  if (retryQueue.length > 0) {
    if (retryTimeout) {
      clearTimeout(retryTimeout);
    }
    retryTimeout = setTimeout(processRetryQueue, RETRY_DELAY_MS);
  } else {
    retryTimeout = null;
  }
}

// Queue event for retry
function queueForRetry(event: QueuedEvent): void {
  retryQueue.push(event);

  // Start retry processing if not already running
  if (!retryTimeout) {
    retryTimeout = setTimeout(processRetryQueue, RETRY_DELAY_MS);
  }
}

// Internal event recording with retry support
async function recordEventInternal(params: RecordEventParams & { retries?: number }, isRetry = false): Promise<void> {
  try {
    const now = new Date();
    // Send client's local time info to avoid server timezone issues
    const localHour = now.getHours();
    const localDayOfWeek = now.getDay(); // 0=Sunday (JavaScript convention)

    // Wrap JSON.stringify in try-catch to handle circular references or other issues
    let body: string;
    try {
      body = JSON.stringify({
        ...params,
        session_id: getSessionId(),
        local_hour: localHour,
        local_day_of_week: localDayOfWeek,
        mode: currentMode,
      });
    } catch {
      return; // Don't crash, just skip this observation
    }

    await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body,
    });
  } catch (error) {
    const retries = (params.retries ?? 0) + 1;

    if (retries < MAX_RETRIES) {
      // Queue for retry
      queueForRetry({
        ...params,
        retries,
        timestamp: Date.now(),
      });
    } else {
      // Give up after max retries
    }
  }
}

export async function recordEvent(params: RecordEventParams): Promise<void> {
  return recordEventInternal(params);
}

// View tracking
export function enterView(viewName: ViewName | string): void {
  // Exit previous view first
  if (currentView && currentView !== viewName) {
    exitView();
  }

  currentView = viewName;
  viewEnterTime = Date.now();

  recordEvent({
    event_type: 'view_enter',
    view_name: viewName,
  });
}

export function exitView(): void {
  if (currentView && viewEnterTime) {
    const dwellSeconds = (Date.now() - viewEnterTime) / 1000;

    recordEvent({
      event_type: 'view_exit',
      view_name: currentView,
      metadata: { dwell_seconds: dwellSeconds },
    });

    // Update dwell time aggregate
    updateDwellTime(currentView, dwellSeconds);

    currentView = null;
    viewEnterTime = null;
  }
}

async function updateDwellTime(viewName: string, seconds: number): Promise<void> {
  try {
    await fetch(`${API_BASE}/dwell-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        session_id: getSessionId(),
        view_name: viewName,
        seconds,
      }),
    });
  } catch {
    // Observation endpoint failures must never break the app
  }
}

// Action tracking
export function recordAction(
  actionName: string,
  entityType?: string,
  entityId?: number,
  metadata?: Record<string, unknown>
): void {
  recordEvent({
    event_type: 'action',
    view_name: currentView || undefined,
    action_name: actionName,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

// Edit tracking
export function recordEdit(
  entityType: string,
  entityId: number,
  changes: Record<string, unknown>
): void {
  recordEvent({
    event_type: 'edit',
    view_name: currentView || undefined,
    action_name: 'edit',
    entity_type: entityType,
    entity_id: entityId,
    metadata: { changes },
  });
}

// Dismissal tracking (analytics only - for suppression logic use surfacing.ts recordDismissal)
export function trackDismissalEvent(
  itemType: string,
  reason?: string
): void {
  recordEvent({
    event_type: 'dismissal',
    view_name: currentView || undefined,
    action_name: 'dismiss',
    metadata: { item_type: itemType, reason },
  });
}

// =============================================================================
// INSIGHT TRACKING — insight card interaction pattern
// =============================================================================

interface InsightTrackingParams {
  insightId: string;
  insightType: string;
  confidence?: number;
  shownTimestamp?: number;
}

/**
 * Track when an insight becomes visible to the user.
 * Used for insight attribution and learning.
 */
export function trackInsightShown(params: InsightTrackingParams): void {
  recordEvent({
    event_type: 'insight_shown',
    view_name: currentView || undefined,
    action_name: 'shown',
    entity_type: 'insight',
    metadata: {
      insight_id: params.insightId,
      insight_type: params.insightType,
      confidence: params.confidence,
      mode: currentMode,
    },
  });
}

/**
 * Track when user accepts an insight (positive signal).
 * Accepted insights receive a +0.1 confidence boost.
 */
export function trackInsightAccepted(params: InsightTrackingParams): void {
  const timeToAction = params.shownTimestamp
    ? Date.now() - params.shownTimestamp
    : undefined;

  recordEvent({
    event_type: 'insight_interacted',
    view_name: currentView || undefined,
    action_name: 'accepted',
    entity_type: 'insight',
    metadata: {
      insight_id: params.insightId,
      insight_type: params.insightType,
      confidence: params.confidence,
      mode: currentMode,
      time_to_action_ms: timeToAction,
    },
  });
}

/**
 * Track when user dismisses an insight (negative signal).
 * Three dismissals trigger automatic suppression.
 */
export function trackInsightDismissed(params: InsightTrackingParams): void {
  const timeToAction = params.shownTimestamp
    ? Date.now() - params.shownTimestamp
    : undefined;

  recordEvent({
    event_type: 'insight_interacted',
    view_name: currentView || undefined,
    action_name: 'dismissed',
    entity_type: 'insight',
    metadata: {
      insight_id: params.insightId,
      insight_type: params.insightType,
      confidence: params.confidence,
      mode: currentMode,
      time_to_action_ms: timeToAction,
    },
  });
}

/**
 * Track when user suppresses an insight type ("Don't show again").
 * Suppression lasts 30 days for the selected insight type.
 */
export function trackInsightSuppressed(params: InsightTrackingParams): void {
  recordEvent({
    event_type: 'insight_interacted',
    view_name: currentView || undefined,
    action_name: 'suppressed',
    entity_type: 'insight',
    metadata: {
      insight_id: params.insightId,
      insight_type: params.insightType,
      mode: currentMode,
    },
  });
}

/**
 * Track when user hovers/considers an insight (engagement signal).
 * A hover longer than 2 seconds is recorded as a consideration signal.
 */
export function trackInsightConsidered(params: InsightTrackingParams & { hoverDurationMs: number }): void {
  recordEvent({
    event_type: 'insight_interacted',
    view_name: currentView || undefined,
    action_name: 'considered',
    entity_type: 'insight',
    metadata: {
      insight_id: params.insightId,
      insight_type: params.insightType,
      hover_duration_ms: params.hoverDurationMs,
      mode: currentMode,
    },
  });
}

// Get current view (for debugging)
export function getCurrentView(): string | null {
  return currentView;
}

// Get current session ID (for debugging)
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}
