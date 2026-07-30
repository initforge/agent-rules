import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="page">
          <div className="page-header">
            <h1 className="typography-title">Error</h1>
            <p className="typography-caption">Something went wrong rendering this page</p>
          </div>
          <div className="state-error">{this.state.error?.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
