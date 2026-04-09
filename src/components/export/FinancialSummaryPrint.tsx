/**
 * FinancialSummaryPrint — Printable financial summary.
 *
 * Budget table, upcoming bills, savings progress.
 */

import { forwardRef } from 'react';
import { PrintLayout } from './PrintLayout';
import type { UnifiedBill } from '@/hooks/useUnifiedBills';
import type { FinancialItem } from '@/types';

interface FinancialSummaryPrintProps {
  weekStart: string;
  bills: UnifiedBill[];
  income: FinancialItem[];
}

export const FinancialSummaryPrint = forwardRef<HTMLDivElement, FinancialSummaryPrintProps>(
  function FinancialSummaryPrint({ weekStart, bills, income }, ref) {
    const totalBills = bills.reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalIncome = income.reduce((sum, i) => sum + (i.amount || 0), 0);

    return (
      <PrintLayout ref={ref} title="Financial Summary" dateRange={`Week of ${formatDate(weekStart)}`}>
        {/* Overview Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <SummaryCard label="Total Income" amount={totalIncome} color="green" />
          <SummaryCard label="Total Bills" amount={totalBills} color="red" />
          <SummaryCard label="Net" amount={totalIncome - totalBills} color={totalIncome >= totalBills ? 'green' : 'red'} />
        </div>

        {/* Upcoming Bills */}
        {bills.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 pb-1 mb-3">
              Upcoming Bills ({bills.length})
            </h3>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Due Date</th>
                  <th className="text-right p-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.uid} className="border-b border-gray-100">
                    <td className="p-2 text-sm text-gray-800">{bill.name}</td>
                    <td className="p-2 text-sm text-gray-600">{bill.dueDate}</td>
                    <td className="p-2 text-sm text-gray-800 text-right font-mono">
                      ${bill.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={2} className="p-2 text-sm font-semibold text-gray-800">
                    Total
                  </td>
                  <td className="p-2 text-sm font-bold text-gray-800 text-right font-mono">
                    ${totalBills.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Income */}
        {income.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 pb-1 mb-3">
              Income ({income.length})
            </h3>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left p-2">Source</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-right p-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {income.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="p-2 text-sm text-gray-800">{item.name}</td>
                    <td className="p-2 text-sm text-gray-600">{item.due_date}</td>
                    <td className="p-2 text-sm text-green-700 text-right font-mono">
                      ${item.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={2} className="p-2 text-sm font-semibold text-gray-800">
                    Total Income
                  </td>
                  <td className="p-2 text-sm font-bold text-green-700 text-right font-mono">
                    ${totalIncome.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </PrintLayout>
    );
  }
);

function SummaryCard({
  label,
  amount,
  color,
}: {
  label: string;
  amount: number;
  color: 'green' | 'red';
}) {
  const textColor = color === 'green' ? 'text-green-700' : 'text-red-700';
  const bgColor = color === 'green' ? 'bg-green-50' : 'bg-red-50';
  const borderColor = color === 'green' ? 'border-green-200' : 'border-red-200';

  return (
    <div className={`p-4 rounded-lg border ${bgColor} ${borderColor}`}>
      <p className="text-xs text-gray-500 uppercase font-semibold">{label}</p>
      <p className={`text-xl font-bold font-mono mt-1 ${textColor}`}>
        ${Math.abs(amount).toFixed(2)}
      </p>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year}`;
}
