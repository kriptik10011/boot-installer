/**
 * Notifications Hook
 *
 * Integrates the notification service with React components.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationService } from '@/services/notifications';
import { financesApi } from '@/api/client';
import { eventsApi } from '@/api/client';
import { formatDateLocal } from '@/utils/dateUtils';

/**
 * Hook to start notification checking when the app mounts.
 * Should be used in App.tsx or a top-level component.
 */
export function useNotificationService() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Functions to get data for notification checks
    const getBills = async () => {
      // Try to get from cache first
      const cached = queryClient.getQueryData<Array<{
        id: number;
        name: string;
        amount: number;
        due_date: string;
        is_paid: boolean;
      }>>(['finances', 'list']);

      if (cached) return cached;

      // Fetch fresh data
      return financesApi.list();
    };

    const getEvents = async () => {
      // Get today's date for fetching current week
      const today = new Date();
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(today);
      weekStart.setDate(diff);
      const weekStartStr = formatDateLocal(weekStart);

      // Try to get from cache first
      const cached = queryClient.getQueryData<Array<{
        id: number;
        name: string;
        date: string;
        start_time: string | null;
        location: string | null;
      }>>(['events', 'week', weekStartStr]);

      if (cached) return cached;

      // Fetch fresh data
      return eventsApi.getWeek(weekStartStr);
    };

    // Start periodic checking
    notificationService.startPeriodicCheck(getBills, getEvents);

    // Cleanup on unmount
    return () => {
      notificationService.stopPeriodicCheck();
    };
  }, [queryClient]);
}

/**
 * Hook to get notification preferences.
 */
export function useNotificationPreferences() {
  return notificationService.getPreferences();
}

/**
 * Hook to send a test notification.
 */
export function useSendTestNotification() {
  return async () => {
    await notificationService.send(
      'Test Notification',
      'Notifications are working correctly!'
    );
  };
}
