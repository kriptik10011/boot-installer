/**
 * BillPanel Component
 *
 * Contextual panel for viewing/editing bills.
 * Mark paid, edit details, view related bills.
 */

import { useState, useEffect } from 'react';
import {
  useFinancialItem,
  useCreateFinancialItem,
  useUpdateFinancialItem,
  useMarkPaid,
  financeKeys,
} from '@/hooks/useFinances';
import { financesApi } from '@/api/client';
import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { RecurrencePicker } from '@/components/shared/RecurrencePicker';
import { getTodayLocal, isBefore } from '@/utils/dateUtils';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { useCreateRecurrenceRule, useRecurrenceRule, useDeleteRecurrenceRule } from '@/hooks/useRecurrence';
import { useToastStore } from '@/stores/toastStore';
import type { BillPanelProps } from './types';
import type { FinancialItem, FinancialItemCreate, FinancialItemUpdate, RecurrenceRuleCreate } from '@/types';

export function BillPanel({ billId, date, onClose }: BillPanelProps) {
  const { data: bill, isLoading } = useFinancialItem(billId || 0);
  const createItem = useCreateFinancialItem();
  const updateItem = useUpdateFinancialItem();
  const markPaid = useMarkPaid();
  const createRecurrenceRule = useCreateRecurrenceRule();
  const deleteRecurrenceRule = useDeleteRecurrenceRule();

  const isNew = billId === null;

  // Recurrence state
  const [recurrence, setRecurrence] = useState<RecurrenceRuleCreate | null>(null);
  const { data: existingRule } = useRecurrenceRule(bill?.recurrence_rule_id ?? null);

  const addToast = useToastStore((s) => s.addToast);

  // Undo-delete for bills
  const { requestDelete } = useUndoDelete<FinancialItem>({
    entityLabel: 'bill',
    getItemName: (b) => b.name,
    getItemId: (b) => b.id,
    listQueryKeys: [financeKeys.lists()],
    deleteFn: (id) => financesApi.delete(id),
    invalidateKeys: [financeKeys.all],
  });

  // Form state - use passed date prop for new bills, otherwise today
  const [form, setForm] = useState<FinancialItemCreate>({
    name: '',
    amount: 0,
    due_date: date || getTodayLocal(),
    type: 'bill',
    notes: null,
  });

  // Initialize form with existing bill data
  useEffect(() => {
    if (bill) {
      setForm({
        name: bill.name,
        amount: bill.amount,
        due_date: bill.due_date,
        type: bill.type,
        notes: bill.notes,
      });
    }
  }, [bill]);

  // Populate recurrence picker from existing rule
  useEffect(() => {
    if (existingRule) {
      setRecurrence({
        frequency: existingRule.frequency,
        interval: existingRule.interval,
        day_of_week: existingRule.day_of_week,
        day_of_month: existingRule.day_of_month,
        end_type: existingRule.end_type,
        end_count: existingRule.end_count,
        end_date: existingRule.end_date,
      });
    }
  }, [existingRule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let newRuleId: number | null = null;
    try {
      // Create or clear recurrence rule
      let ruleId: number | null = bill?.recurrence_rule_id ?? null;
      if (recurrence) {
        const newRule = await createRecurrenceRule.mutateAsync(recurrence);
        ruleId = newRule.id;
        newRuleId = newRule.id;
      } else {
        ruleId = null;
      }

      const formWithRecurrence = { ...form, recurrence_rule_id: ruleId };

      if (isNew) {
        await createItem.mutateAsync(formWithRecurrence);
      } else if (billId) {
        await updateItem.mutateAsync({ id: billId, data: formWithRecurrence as FinancialItemUpdate });
      }
      addToast({ message: 'Bill saved successfully', type: 'success', durationMs: 4000 });
      setTimeout(() => onClose(), 500);
    } catch (error) {
      // Clean up orphaned recurrence rule if bill save failed
      if (newRuleId) {
        deleteRecurrenceRule.mutate(newRuleId);
      }
      const detail = error instanceof Error ? error.message : 'Unknown error';
      addToast({ message: `Failed to save bill: ${detail}`, type: 'error', durationMs: 4000 });
    }
  };

  // Handle delete — undo toast pattern
  const handleDelete = () => {
    if (!billId || !bill) return;
    requestDelete(bill);
    onClose();
  };

  const handleMarkPaid = async () => {
    if (billId) {
      try {
        await markPaid.mutateAsync(billId);
        addToast({ message: 'Marked as paid', type: 'success', durationMs: 4000 });
        setTimeout(() => onClose(), 500);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error';
        addToast({ message: `Failed to mark as paid: ${detail}`, type: 'error', durationMs: 4000 });
      }
    }
  };

  if (isLoading && !isNew) {
    return <PanelSkeleton />;
  }

  // Use string comparison for dates (YYYY-MM-DD format is lexicographically sortable)
  const isOverdue = bill && !bill.is_paid && isBefore(bill.due_date, getTodayLocal());

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {/* Status Badge */}
      {!isNew && bill && (
        <div className="flex items-center gap-2">
          {bill.is_paid ? (
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-sm font-medium rounded-full">
              Paid
            </span>
          ) : isOverdue ? (
            <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-sm font-medium rounded-full">
              Needs Attention
            </span>
          ) : (
            <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-sm font-medium rounded-full">
              Unpaid
            </span>
          )}
        </div>
      )}

      {/* Note: Income type removed from this panel per UX decision.
          Bills are things that need attention (overdue, mark paid).
          Income is passive/informational and belongs in a separate section.
          This panel is specifically for bills that need user action. */}

      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          placeholder="e.g., Electric Bill, Rent"
          required
        />
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-slate-300 mb-2">
          Amount
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
          <input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
            className="w-full px-4 py-2 pl-8 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            required
          />
        </div>
      </div>

      {/* Due Date */}
      <div>
        <label htmlFor="due_date" className="block text-sm font-medium text-slate-300 mb-2">
          Due Date
        </label>
        <input
          id="due_date"
          type="date"
          value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          required
        />
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-slate-300 mb-2">
          Notes
        </label>
        <textarea
          id="notes"
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 resize-none"
          placeholder="Add notes (optional)"
          rows={3}
        />
      </div>

      {/* Recurrence */}
      <RecurrencePicker value={recurrence} onChange={setRecurrence} showBillFrequencies />

      {/* Mark Paid Button (for existing unpaid bills) */}
      {!isNew && bill && !bill.is_paid && (
        <button
          type="button"
          onClick={handleMarkPaid}
          disabled={markPaid.isPending}
          className="w-full px-4 py-3 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-medium rounded-lg hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Mark as Paid
          </span>
        </button>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-700">
        {!isNew && (
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
          >
            Delete
          </button>
        )}
        <div className={`flex items-center gap-3 ${isNew ? 'ml-auto' : ''}`}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createItem.isPending || updateItem.isPending}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isNew ? 'Add Item' : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  );
}
