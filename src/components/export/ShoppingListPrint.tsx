/**
 * ShoppingListPrint — Printable shopping list with checkboxes.
 *
 * Groups items by category with package quantities.
 */

import { forwardRef } from 'react';
import { PrintLayout } from './PrintLayout';
import type { ShoppingListItem } from '@/api/client';

interface ShoppingListPrintProps {
  weekStart: string;
  items: ShoppingListItem[];
}

interface GroupedItems {
  [category: string]: ShoppingListItem[];
}

export const ShoppingListPrint = forwardRef<HTMLDivElement, ShoppingListPrintProps>(
  function ShoppingListPrint({ weekStart, items }, ref) {
    const grouped = items.reduce<GroupedItems>((acc, item) => {
      const category = item.category || 'Other';
      return {
        ...acc,
        [category]: [...(acc[category] || []), item],
      };
    }, {});

    const sortedCategories = Object.keys(grouped).sort();

    return (
      <PrintLayout ref={ref} title="Shopping List" dateRange={`Week of ${formatDate(weekStart)}`}>
        <div className="space-y-6">
          {sortedCategories.map((category) => (
            <div key={category}>
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 pb-1 mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {grouped[category].map((item) => (
                  <div key={item.id} className="flex items-center gap-3 py-1">
                    <div className="w-4 h-4 border-2 border-gray-400 rounded-sm flex-shrink-0" />
                    <div className="flex-1">
                      <span className="text-sm text-gray-800 font-medium">
                        {item.name}
                      </span>
                      {(item.quantity_amount || item.quantity_unit) && (
                        <span className="text-sm text-gray-500 ml-2">
                          {item.quantity_amount ? formatQuantity(item.quantity_amount) : ''}
                          {item.quantity_unit ? ` ${item.quantity_unit}` : ''}
                        </span>
                      )}
                    </div>
                    {item.package_display && (
                      <span className="text-xs text-gray-400">
                        {item.package_display}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <p className="text-center text-gray-400 py-8">
              No items on the shopping list.
            </p>
          )}

          {/* Summary */}
          <div className="border-t border-gray-300 pt-3 mt-4">
            <p className="text-xs text-gray-500">
              {items.length} item{items.length !== 1 ? 's' : ''} total
            </p>
          </div>
        </div>
      </PrintLayout>
    );
  }
);

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year}`;
}

function formatQuantity(amount: number): string {
  if (amount === Math.floor(amount)) return String(amount);
  return amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
