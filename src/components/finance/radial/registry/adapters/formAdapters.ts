/**
 * Form adapter hooks — encapsulate form state, validation, and mutations
 * for inline add forms within arc cards. Return InlineCardFormProps.
 */

import { useState, useCallback } from 'react';
import { useCreateEvent } from '@/hooks';
import { useCreateFinancialItem } from '@/hooks/useFinances';
import { useCreateRecurrenceRule, useDeleteRecurrenceRule } from '@/hooks/useRecurrence';
import { useToastStore } from '@/stores/toastStore';
import { getTodayLocal } from '@/utils/dateUtils';
import type { EventCreate, RecurrenceRuleCreate } from '@/types';
import type { FinancialItemCreate } from '@/types/finance';
import type { FormFieldProps } from '../../shapes/FormField';
import type { InlineCardFormProps } from '../../shapes/InlineCardForm';
import { TimePicker } from '../../shapes/TimePicker';
import { createElement } from 'react';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (d: string) => DATE_RE.test(d) && !isNaN(new Date(d).getTime());

// ── Event form adapter ──

export function useEventFormAdapter(onClose: () => void): InlineCardFormProps {
  const today = getTodayLocal();
  const [name, setName] = useState('');
  const [date, setDate] = useState(today);
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');
  const [timeEnabled, setTimeEnabled] = useState(false);
  const [recEnabled, setRecEnabled] = useState(false);
  const [recFrequency, setRecFrequency] = useState('weekly');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createEvent = useCreateEvent();
  const createRecurrenceRule = useCreateRecurrenceRule();
  const deleteRecurrenceRule = useDeleteRecurrenceRule();
  const addToast = useToastStore((s) => s.addToast);

  const canSubmit = !!name.trim() && isValidDate(date);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let ruleId: number | null = null;
      if (recEnabled) {
        const rule = await createRecurrenceRule.mutateAsync({
          frequency: recFrequency as RecurrenceRuleCreate['frequency'],
          interval: 1,
          end_type: 'never',
        });
        ruleId = rule.id;
      }
      // Format time from picker state
      let startTime: string | null = null;
      if (timeEnabled) {
        const h24 = ampm === 'AM' ? (hour === 12 ? 0 : hour) : (hour === 12 ? 12 : hour + 12);
        startTime = `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
      const eventData: EventCreate = {
        name: name.trim(),
        date,
        start_time: startTime,
        end_time: null,
        location: null,
        recurrence_rule_id: ruleId,
      };
      try {
        await createEvent.mutateAsync(eventData);
        addToast({ message: `Added "${name.trim()}"`, type: 'success', durationMs: 3000 });
        onClose();
      } catch {
        if (ruleId) {
          try { await deleteRecurrenceRule.mutateAsync(ruleId); } catch { /* best effort */ }
        }
        addToast({ message: 'Failed to create event', type: 'error', durationMs: 4000 });
      }
    } catch {
      addToast({ message: 'Failed to create recurrence', type: 'error', durationMs: 4000 });
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, isSubmitting, name, date, hour, minute, ampm, timeEnabled, recEnabled, recFrequency, createEvent, createRecurrenceRule, deleteRecurrenceRule, addToast, onClose]);

  const accent = '#22d3ee'; // cyan
  const fields: FormFieldProps[] = [
    { type: 'text', label: 'Event name', value: name, onChange: (v) => setName(v.slice(0, 100)), accentColor: accent, autoFocus: true },
    { type: 'text', label: 'Date (YYYY-MM-DD)', value: date, onChange: setDate, accentColor: accent },
  ];

  return {
    fields,
    timePicker: timeEnabled
      ? createElement(TimePicker, { hour, minute, ampm, onHourChange: setHour, onMinuteChange: setMinute, onAmpmChange: setAmpm, accentColor: accent })
      : null,
    timeToggle: { enabled: timeEnabled, onToggle: () => setTimeEnabled(prev => !prev) },
    recurrence: {
      enabled: recEnabled,
      frequency: recFrequency,
      onToggle: () => setRecEnabled((prev) => !prev),
      onFrequencyChange: setRecFrequency,
    },
    onSubmit: handleSubmit,
    onCancel: onClose,
    submitLabel: 'Add Event',

    isSubmitting,
    canSubmit,
  };
}

// ── Bill form adapter ──

export function useBillFormAdapter(onClose: () => void): InlineCardFormProps {
  const today = getTodayLocal();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [recEnabled, setRecEnabled] = useState(false);
  const [recFrequency, setRecFrequency] = useState('monthly');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createBill = useCreateFinancialItem();
  const createRecurrenceRule = useCreateRecurrenceRule();
  const deleteRecurrenceRule = useDeleteRecurrenceRule();
  const addToast = useToastStore((s) => s.addToast);

  const parsedAmount = parseFloat(amount) || 0;
  const canSubmit = !!name.trim() && parsedAmount > 0 && isValidDate(dueDate);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let ruleId: number | null = null;
      if (recEnabled) {
        const rule = await createRecurrenceRule.mutateAsync({
          frequency: recFrequency as RecurrenceRuleCreate['frequency'],
          interval: 1,
          end_type: 'never',
        });
        ruleId = rule.id;
      }
      const billData: FinancialItemCreate = {
        name: name.trim(),
        amount: parsedAmount,
        due_date: dueDate,
        type: 'bill',
        notes: null,
        recurrence_rule_id: ruleId,
      };
      try {
        await createBill.mutateAsync(billData);
        addToast({ message: `Added "$${parsedAmount}" bill`, type: 'success', durationMs: 3000 });
        onClose();
      } catch {
        if (ruleId) {
          try { await deleteRecurrenceRule.mutateAsync(ruleId); } catch { /* best effort */ }
        }
        addToast({ message: 'Failed to create bill', type: 'error', durationMs: 4000 });
      }
    } catch {
      addToast({ message: 'Failed to create recurrence', type: 'error', durationMs: 4000 });
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, isSubmitting, name, parsedAmount, dueDate, recEnabled, recFrequency, createBill, createRecurrenceRule, deleteRecurrenceRule, addToast, onClose]);

  const accent = '#f59e0b'; // amber
  const fields: FormFieldProps[] = [
    { type: 'text', label: 'Bill name', value: name, onChange: (v) => setName(v.slice(0, 100)), accentColor: accent, autoFocus: true },
    { type: 'text', label: 'Amount ($)', value: amount, onChange: setAmount, accentColor: accent },
    { type: 'text', label: 'Due date (YYYY-MM-DD)', value: dueDate, onChange: setDueDate, accentColor: accent },
  ];

  return {
    fields,
    recurrence: {
      enabled: recEnabled,
      frequency: recFrequency,
      onToggle: () => setRecEnabled((prev) => !prev),
      onFrequencyChange: setRecFrequency,
    },
    onSubmit: handleSubmit,
    onCancel: onClose,
    submitLabel: 'Add Bill',

    isSubmitting,
    canSubmit,
  };
}
