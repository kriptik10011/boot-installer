/**
 * InlineCardForm — Form content for ActionBar's expandedContent.
 * Parent ActionBar div provides the border. Nested ActionBars are
 * borderless so child buttons follow the parent border design.
 * Supports optional TimePicker with toggle.
 * Composes FormField + ActionBar shapes.
 * Pure props, cqi-responsive. No hooks, no store access.
 */

import { type ReactNode } from 'react';
import { FormField, type FormFieldProps } from './FormField';
import { ActionBar, type ActionItem } from './ActionBar';

interface RecurrenceConfig {
  enabled: boolean;
  frequency: string;
  onToggle: () => void;
  onFrequencyChange: (f: string) => void;
}

interface TimeToggle {
  enabled: boolean;
  onToggle: () => void;
}

export interface InlineCardFormProps {
  fields: readonly FormFieldProps[];
  /** Optional TimePicker element rendered between fields and action buttons */
  timePicker?: ReactNode;
  /** Toggle for showing/hiding the time picker */
  timeToggle?: TimeToggle;
  recurrence?: RecurrenceConfig;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  canSubmit: boolean;
}

export function InlineCardForm({
  fields,
  timePicker,
  timeToggle,
  recurrence,
  onSubmit,
  onCancel,
  submitLabel,
  isSubmitting,
  canSubmit,
}: InlineCardFormProps) {
  // Time toggle + recurrence toggle combined into one row
  const toggleActions: ActionItem[] = [];
  if (timeToggle) {
    toggleActions.push({
      label: timeToggle.enabled ? 'Time' : 'No Time',
      onClick: timeToggle.onToggle,
      variant: timeToggle.enabled ? 'cyan' : 'slate',
    });
  }
  if (recurrence) {
    toggleActions.push({
      label: recurrence.enabled ? 'Repeats' : 'Once',
      onClick: recurrence.onToggle,
      variant: recurrence.enabled ? 'cyan' : 'slate',
    });
    if (recurrence.enabled) {
      for (const f of ['daily', 'weekly', 'monthly', 'yearly']) {
        toggleActions.push({
          label: f.charAt(0).toUpperCase() + f.slice(1),
          onClick: () => recurrence.onFrequencyChange(f),
          variant: recurrence.frequency === f ? 'cyan' : 'slate',
        });
      }
    }
  }

  const formActions: readonly ActionItem[] = [
    { label: 'Cancel', onClick: onCancel, variant: 'slate' },
    {
      label: isSubmitting ? '...' : submitLabel,
      onClick: onSubmit,
      variant: 'cyan',
      disabled: !canSubmit || isSubmitting,
    },
  ];

  return (
    <>
      {fields.map((field) => (
        <FormField key={field.label} {...field} />
      ))}
      {timePicker}
      {toggleActions.length > 0 && <ActionBar actions={toggleActions} borderless />}
      <ActionBar actions={formActions} borderless />
    </>
  );
}
