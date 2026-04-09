/**
 * Notification Service
 *
 * Handles desktop notifications for bills and events.
 * Uses Tauri's notification plugin.
 */

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

// =============================================================================
// Types
// =============================================================================

export interface NotificationPreferences {
  enabled: boolean;
  billReminders: {
    enabled: boolean;
    dayBefore: boolean;
    dayOf: boolean;
  };
  eventReminders: {
    enabled: boolean;
    fifteenMinutes: boolean;
    oneHour: boolean;
    oneDay: boolean;
  };
}

export interface PendingReminder {
  id: string;
  type: 'bill' | 'event';
  title: string;
  body: string;
  scheduledFor: Date;
  itemId: number;
}

// =============================================================================
// Default Preferences
// =============================================================================

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  billReminders: {
    enabled: true,
    dayBefore: true,
    dayOf: true,
  },
  eventReminders: {
    enabled: true,
    fifteenMinutes: true,
    oneHour: false,
    oneDay: false,
  },
};

// =============================================================================
// Storage Keys
// =============================================================================

const PREFERENCES_KEY = 'notification_preferences';
const SENT_NOTIFICATIONS_KEY = 'sent_notifications';

// =============================================================================
// Notification Service
// =============================================================================

class NotificationService {
  private preferences: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;
  private sentNotifications: Set<string> = new Set();
  private checkInterval: number | null = null;

  constructor() {
    this.loadPreferences();
    this.loadSentNotifications();
  }

  /**
   * Load preferences from localStorage.
   */
  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        this.preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch {
    }
  }

  /**
   * Load sent notifications from localStorage (to prevent duplicates).
   */
  private loadSentNotifications(): void {
    try {
      const stored = localStorage.getItem(SENT_NOTIFICATIONS_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        // Clear old entries (older than 7 days)
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const filtered = data.filter((entry: { id: string; timestamp: number }) =>
          entry.timestamp > cutoff
        );
        this.sentNotifications = new Set(filtered.map((e: { id: string }) => e.id));
      }
    } catch {
    }
  }

  /**
   * Save sent notifications to localStorage.
   */
  private saveSentNotifications(): void {
    try {
      const data = Array.from(this.sentNotifications).map((id) => ({
        id,
        timestamp: Date.now(),
      }));
      localStorage.setItem(SENT_NOTIFICATIONS_KEY, JSON.stringify(data));
    } catch {
    }
  }

  /**
   * Get current preferences.
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Update preferences.
   */
  setPreferences(prefs: Partial<NotificationPreferences>): void {
    this.preferences = { ...this.preferences, ...prefs };
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences));
    } catch {
    }
  }

  /**
   * Check if notifications are enabled and permission is granted.
   */
  async isEnabled(): Promise<boolean> {
    if (!this.preferences.enabled) return false;

    try {
      return await isPermissionGranted();
    } catch (e) {
      // Not running in Tauri
      return false;
    }
  }

  /**
   * Request notification permission.
   */
  async requestPermission(): Promise<boolean> {
    try {
      const permission = await requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Send a notification.
   */
  async send(title: string, body: string, notificationId?: string): Promise<void> {
    // Check if already sent (prevent duplicates)
    if (notificationId && this.sentNotifications.has(notificationId)) {
      return;
    }

    const enabled = await this.isEnabled();
    if (!enabled) return;

    try {
      await sendNotification({ title, body });

      if (notificationId) {
        this.sentNotifications.add(notificationId);
        this.saveSentNotifications();
      }
    } catch {
    }
  }

  /**
   * Check for bill reminders and send notifications.
   */
  async checkBillReminders(bills: Array<{
    id: number;
    name: string;
    amount: number;
    due_date: string;
    is_paid: boolean;
  }>): Promise<void> {
    if (!this.preferences.billReminders.enabled) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    for (const bill of bills) {
      if (bill.is_paid) continue;

      const dueDate = new Date(bill.due_date);
      dueDate.setHours(0, 0, 0, 0);

      const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(bill.amount);

      // Day before reminder
      if (this.preferences.billReminders.dayBefore) {
        if (dueDate.getTime() === tomorrow.getTime()) {
          await this.send(
            'Bill Due Tomorrow',
            `${bill.name} (${formattedAmount}) is due tomorrow`,
            `bill-${bill.id}-day-before-${bill.due_date}`
          );
        }
      }

      // Day of reminder
      if (this.preferences.billReminders.dayOf) {
        if (dueDate.getTime() === today.getTime()) {
          await this.send(
            'Bill Due Today',
            `${bill.name} (${formattedAmount}) is due today`,
            `bill-${bill.id}-day-of-${bill.due_date}`
          );
        }
      }
    }
  }

  /**
   * Check for event reminders and send notifications.
   */
  async checkEventReminders(events: Array<{
    id: number;
    name: string;
    date: string;
    start_time: string | null;
    location: string | null;
  }>): Promise<void> {
    if (!this.preferences.eventReminders.enabled) return;

    const now = new Date();

    for (const event of events) {
      if (!event.start_time) continue;

      const eventDateTime = new Date(`${event.date}T${event.start_time}`);
      const diffMs = eventDateTime.getTime() - now.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      const locationText = event.location ? ` at ${event.location}` : '';

      // 15 minutes before
      if (this.preferences.eventReminders.fifteenMinutes) {
        if (diffMinutes > 0 && diffMinutes <= 15) {
          await this.send(
            'Event Starting Soon',
            `${event.name}${locationText} starts in ${Math.round(diffMinutes)} minutes`,
            `event-${event.id}-15min-${event.date}-${event.start_time}`
          );
        }
      }

      // 1 hour before
      if (this.preferences.eventReminders.oneHour) {
        if (diffMinutes > 55 && diffMinutes <= 60) {
          await this.send(
            'Event in 1 Hour',
            `${event.name}${locationText} starts in 1 hour`,
            `event-${event.id}-1hr-${event.date}-${event.start_time}`
          );
        }
      }

      // 1 day before
      if (this.preferences.eventReminders.oneDay) {
        const diffHours = diffMinutes / 60;
        if (diffHours > 23 && diffHours <= 24) {
          await this.send(
            'Event Tomorrow',
            `${event.name}${locationText} is tomorrow`,
            `event-${event.id}-1day-${event.date}`
          );
        }
      }
    }
  }

  /**
   * Start periodic checking for reminders.
   */
  startPeriodicCheck(
    getBills: () => Promise<Array<{ id: number; name: string; amount: number; due_date: string; is_paid: boolean }>>,
    getEvents: () => Promise<Array<{ id: number; name: string; date: string; start_time: string | null; location: string | null }>>
  ): void {
    // Check immediately
    this.checkReminders(getBills, getEvents);

    // Check every 5 minutes
    this.checkInterval = window.setInterval(() => {
      this.checkReminders(getBills, getEvents);
    }, 5 * 60 * 1000);
  }

  /**
   * Stop periodic checking.
   */
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      window.clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check both bills and events for reminders.
   */
  private async checkReminders(
    getBills: () => Promise<Array<{ id: number; name: string; amount: number; due_date: string; is_paid: boolean }>>,
    getEvents: () => Promise<Array<{ id: number; name: string; date: string; start_time: string | null; location: string | null }>>
  ): Promise<void> {
    try {
      const [bills, events] = await Promise.all([getBills(), getEvents()]);
      await this.checkBillReminders(bills);
      await this.checkEventReminders(events);
    } catch {
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
