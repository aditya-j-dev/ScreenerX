'use client';
import React from 'react';
export class FeatureErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error('Feature boundary:', error);
  }
  render() {
    return this.state.hasError ? (
      <div className="rounded-xl border border-red-900 bg-red-950/30 p-6 text-sm text-red-300">
        This feature failed to render. Refresh or retry the page.
      </div>
    ) : (
      this.props.children
    );
  }
}
