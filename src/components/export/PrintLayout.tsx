/**
 * PrintLayout — Wrapper for printable/exportable content.
 *
 * Provides header (title + date range), footer (page number, timestamp),
 * and white background for clean printing.
 */

import { forwardRef, type ReactNode } from 'react';

interface PrintLayoutProps {
  title: string;
  dateRange: string;
  children: ReactNode;
}

export const PrintLayout = forwardRef<HTMLDivElement, PrintLayoutProps>(
  function PrintLayout({ title, dateRange, children }, ref) {
    return (
      <div
        ref={ref}
        className="bg-white text-black p-8 min-w-[800px]"
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-500 mt-1">{dateRange}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Weekly Review</p>
            <p className="text-xs text-gray-400">{new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Content */}
        <div data-print-keep-together="true">
          {children}
        </div>
      </div>
    );
  }
);
