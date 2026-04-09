/**
 * DataSourceSlot — Renders a single data source with error boundary + loading state.
 * MUST be used with key={entry.id} to prevent React hook order violations.
 */

import { Component, Suspense, type ReactNode } from 'react';
import type { DataSourceEntry } from '../registry/types';
import { ShapeRenderer } from './ShapeRenderer';
import { ShapeSkeleton } from './ShapeSkeleton';

// ── Error Boundary with auto-reset on prop change ──

interface ErrorBoundaryProps {
  resetKey: string;
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class DataSourceErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Reset error state when the data source changes (key prop changes)
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[DataSourceSlot] Adapter error:', error, info);
    }
  }

  override render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ── Inner component that calls the adapter hook ──

function DataSourceSlotInner({ entry }: { entry: DataSourceEntry }) {
  const props = entry.useAdapter();
  return <ShapeRenderer shape={entry.shape} props={props} />;
}

// ── Public component ──

export function DataSourceSlot({ entry }: { entry: DataSourceEntry }) {
  return (
    <DataSourceErrorBoundary resetKey={entry.id} fallback={<ShapeSkeleton shape={entry.shape} error />}>
      <Suspense fallback={<ShapeSkeleton shape={entry.shape} />}>
        <DataSourceSlotInner entry={entry} />
      </Suspense>
    </DataSourceErrorBoundary>
  );
}
