/**
 * FinancialImportPanel Component
 *
 * Upload CSV/Excel files to import financial items (bills, income).
 * Supports auto-detection, preview, and AI fallback.
 *
 * Financial data import.
 */

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  financesApi,
  type FinancialImportResult,
  type FinancialImportItem,
} from '@/api/client';

interface FinancialImportPanelProps {
  onClose: () => void;
  onSuccess: () => void;
}

type ImportStep = 'upload' | 'preview' | 'confirm';

export function FinancialImportPanel({ onClose, onSuccess }: FinancialImportPanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [importResult, setImportResult] = useState<FinancialImportResult | null>(null);
  const [editedItems, setEditedItems] = useState<FinancialImportItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => financesApi.importUpload(file),
    onSuccess: (result) => {
      setImportResult(result);
      setEditedItems(result.items);
      setStep('preview');
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to parse file');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (items: FinancialImportItem[]) => financesApi.importConfirm(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finances'] });
      onSuccess();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to import items');
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleItemChange = (index: number, field: keyof FinancialImportItem, value: unknown) => {
    setEditedItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setEditedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    const validItems = editedItems.filter(item =>
      item.name && item.amount && item.amount > 0 && item.due_date
    );
    if (validItems.length > 0) {
      confirmMutation.mutate(validItems);
    }
  };

  const validCount = editedItems.filter(item =>
    item.name && item.amount && item.amount > 0 && item.due_date
  ).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Import Financial Data</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-amber-900/30 border border-amber-800 rounded-lg text-amber-200">
          {error}
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-cyan-500 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="text-4xl mb-4">📁</div>
            <p className="text-white font-medium mb-2">
              {uploadMutation.isPending ? 'Processing...' : 'Drop a file here or click to upload'}
            </p>
            <p className="text-sm text-slate-400">
              Supports CSV (.csv) and Excel (.xlsx, .xls)
            </p>
          </div>

          {/* Sample Format */}
          <div className="p-4 bg-slate-800 rounded-lg">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Expected Format</h3>
            <div className="text-xs text-slate-400 font-mono overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left border-b border-slate-700">
                    <th className="pb-2 pr-4">name</th>
                    <th className="pb-2 pr-4">amount</th>
                    <th className="pb-2 pr-4">due_date</th>
                    <th className="pb-2 pr-4">type</th>
                    <th className="pb-2">recurring</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-1 pr-4">Electric Bill</td>
                    <td className="py-1 pr-4">$135.00</td>
                    <td className="py-1 pr-4">2026-02-15</td>
                    <td className="py-1 pr-4">bill</td>
                    <td className="py-1">yes</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && importResult && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="flex gap-4 text-sm">
            <span className="text-slate-400">
              Total: <span className="text-white">{importResult.total_rows}</span>
            </span>
            <span className="text-emerald-400">
              Valid: {validCount}
            </span>
            {importResult.error_rows > 0 && (
              <span className="text-amber-400">
                Needs Review: {importResult.error_rows}
              </span>
            )}
          </div>

          {/* Detected Columns */}
          {Object.keys(importResult.detected_columns).length > 0 && (
            <div className="text-xs text-slate-400">
              Detected: {Object.entries(importResult.detected_columns).map(([field, col]) => (
                <span key={field} className="mr-2">
                  {field}={col}
                </span>
              ))}
            </div>
          )}

          {/* Items Preview */}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {editedItems.map((item, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg ${
                  item.is_valid ? 'bg-slate-700/50' : 'bg-amber-900/20 border border-amber-800/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs text-slate-500 w-6">#{item.source_row}</span>
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Name"
                      value={item.name || ''}
                      onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                      className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={item.amount || ''}
                      onChange={(e) => handleItemChange(idx, 'amount', parseFloat(e.target.value) || null)}
                      className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="date"
                      value={item.due_date || ''}
                      onChange={(e) => handleItemChange(idx, 'due_date', e.target.value)}
                      className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                    <select
                      value={item.type || 'bill'}
                      onChange={(e) => handleItemChange(idx, 'type', e.target.value)}
                      className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="bill">Bill</option>
                      <option value="income">Income</option>
                    </select>
                  </div>
                  <button
                    onClick={() => handleRemoveItem(idx)}
                    className="p-1 text-slate-400 hover:text-amber-400"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {item.validation_errors.length > 0 && (
                  <div className="mt-1 ml-9 text-xs text-amber-400">
                    {item.validation_errors.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t border-slate-700">
            <button
              onClick={() => setStep('upload')}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={validCount === 0 || confirmMutation.isPending}
              className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {confirmMutation.isPending ? 'Importing...' : `Import ${validCount} Items`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
