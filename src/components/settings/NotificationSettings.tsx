/**
 * Notification Settings Component
 *
 * Allows users to configure notification preferences.
 */

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  notificationService,
  type NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@/services/notifications';

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ label, description, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <label className={`flex items-start gap-4 cursor-pointer ${disabled ? 'opacity-50' : ''}`}>
      <div className="relative mt-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div
          className={`
            w-10 h-6 rounded-full transition-colors
            ${checked ? 'bg-cyan-500' : 'bg-slate-600'}
          `}
        />
        <div
          className={`
            absolute top-1 left-1 w-4 h-4 bg-white rounded-full
            transition-transform
            ${checked ? 'translate-x-4' : 'translate-x-0'}
          `}
        />
      </div>
      <div className="flex-1">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        {description && (
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  // Load preferences and check permission on mount
  useEffect(() => {
    setPreferences(notificationService.getPreferences());

    notificationService.isEnabled().then((enabled) => {
      setPermissionGranted(enabled);
    });
  }, []);

  // Handle preference changes
  const handleChange = (update: Partial<NotificationPreferences>) => {
    const newPrefs = { ...preferences, ...update };
    setPreferences(newPrefs);
    notificationService.setPreferences(newPrefs);
  };

  // Handle bill reminder changes
  const handleBillChange = (key: keyof NotificationPreferences['billReminders'], value: boolean) => {
    const newBillPrefs = { ...preferences.billReminders, [key]: value };
    handleChange({ billReminders: newBillPrefs });
  };

  // Handle event reminder changes
  const handleEventChange = (key: keyof NotificationPreferences['eventReminders'], value: boolean) => {
    const newEventPrefs = { ...preferences.eventReminders, [key]: value };
    handleChange({ eventReminders: newEventPrefs });
  };

  // Request permission
  const handleRequestPermission = async () => {
    const granted = await notificationService.requestPermission();
    setPermissionGranted(granted);
  };

  const isDisabled = !preferences.enabled;

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {preferences.enabled ? (
            <Bell className="w-5 h-5 text-cyan-400" />
          ) : (
            <BellOff className="w-5 h-5 text-slate-500" />
          )}
          <h2 className="text-lg font-semibold text-slate-100">Notifications</h2>
        </div>
      </div>

      {/* Permission Status */}
      {permissionGranted === false && preferences.enabled && (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-sm text-amber-400 mb-3">
            Notification permission is required to receive reminders.
          </p>
          <button
            onClick={handleRequestPermission}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-medium rounded-lg transition-colors"
          >
            Enable Notifications
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* Master Toggle */}
        <Toggle
          label="Enable Notifications"
          description="Receive reminders for bills and events"
          checked={preferences.enabled}
          onChange={(checked) => handleChange({ enabled: checked })}
        />

        {/* Divider */}
        <hr className="border-slate-700" />

        {/* Bill Reminders */}
        <div className={isDisabled ? 'opacity-50' : ''}>
          <h3 className="text-sm font-medium text-slate-300 mb-4">Bill Reminders</h3>
          <div className="space-y-4 pl-4">
            <Toggle
              label="Bill reminders enabled"
              checked={preferences.billReminders.enabled}
              onChange={(checked) => handleBillChange('enabled', checked)}
              disabled={isDisabled}
            />
            <Toggle
              label="Day before due date"
              description="Remind me one day before a bill is due"
              checked={preferences.billReminders.dayBefore}
              onChange={(checked) => handleBillChange('dayBefore', checked)}
              disabled={isDisabled || !preferences.billReminders.enabled}
            />
            <Toggle
              label="Day of due date"
              description="Remind me on the day a bill is due"
              checked={preferences.billReminders.dayOf}
              onChange={(checked) => handleBillChange('dayOf', checked)}
              disabled={isDisabled || !preferences.billReminders.enabled}
            />
          </div>
        </div>

        {/* Event Reminders */}
        <div className={isDisabled ? 'opacity-50' : ''}>
          <h3 className="text-sm font-medium text-slate-300 mb-4">Event Reminders</h3>
          <div className="space-y-4 pl-4">
            <Toggle
              label="Event reminders enabled"
              checked={preferences.eventReminders.enabled}
              onChange={(checked) => handleEventChange('enabled', checked)}
              disabled={isDisabled}
            />
            <Toggle
              label="15 minutes before"
              description="Remind me 15 minutes before an event"
              checked={preferences.eventReminders.fifteenMinutes}
              onChange={(checked) => handleEventChange('fifteenMinutes', checked)}
              disabled={isDisabled || !preferences.eventReminders.enabled}
            />
            <Toggle
              label="1 hour before"
              description="Remind me 1 hour before an event"
              checked={preferences.eventReminders.oneHour}
              onChange={(checked) => handleEventChange('oneHour', checked)}
              disabled={isDisabled || !preferences.eventReminders.enabled}
            />
            <Toggle
              label="1 day before"
              description="Remind me 1 day before an event"
              checked={preferences.eventReminders.oneDay}
              onChange={(checked) => handleEventChange('oneDay', checked)}
              disabled={isDisabled || !preferences.eventReminders.enabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
