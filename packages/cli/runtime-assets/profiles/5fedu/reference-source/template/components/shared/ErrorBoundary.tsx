import React, { Component, ErrorInfo, ReactNode } from 'react';
import { txt } from '@/lib/text';
import * as Sentry from '@sentry/react';
import { Loader2 } from 'lucide-react';
import ErrorState from './ErrorState';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isRetrying: boolean;
}

/** Map lỗi tiếng Anh thường gặp sang key i18n tiếng Việt */
function getErrorMessageKey(error: Error): string {
  const msg = (error?.message || '').toLowerCase();
  const name = (error?.name || '').toLowerCase();
  if (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    name === 'networkerror' ||
    msg.includes('connection')
  )
    return 'shared.error.network';
  if (
    msg.includes('unauthorized') ||
    msg.includes('401') ||
    msg.includes('jwt') ||
    msg.includes('token') ||
    msg.includes('session')
  )
    return 'shared.error.unauthorized';
  if (msg.includes('forbidden') || msg.includes('403')) return 'shared.error.forbidden';
  if (msg.includes('not found') || msg.includes('404')) return 'shared.error.notFound';
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('504') ||
    msg.includes('408')
  )
    return 'shared.error.timeout';
  if (
    msg.includes('500') ||
    msg.includes('server error') ||
    msg.includes('internal server') ||
    msg.includes('bad gateway') ||
    msg.includes('502') ||
    msg.includes('503')
  )
    return 'shared.error.server';
  // Lỗi runtime JavaScript – việt hóa thông báo
  if (msg.includes('before initialization') || msg.includes('cannot access') || msg.includes('tdz'))
    return 'shared.error.beforeInitialization';
  if (msg.includes('is not a function') || msg.includes('undefined is not'))
    return 'shared.error.notFunction';
  if (msg.includes('is not defined'))
    return 'shared.error.notDefined';
  if (msg.includes('chunk') && (msg.includes('loading') || msg.includes('failed')))
    return 'shared.error.chunkLoad';
  return 'shared.error.unknown';
}

/**
 * Error Boundary toàn app: bắt lỗi render trong cây con, hiển thị ErrorState
 * và nút "Tải lại" / "Về trang chủ" thay vì crash trắng màn hình.
 */
class ErrorBoundaryClass extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isRetrying: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
    if (!import.meta.env.DEV && typeof Sentry?.captureException === 'function') {
      Sentry.captureException(error, { extra: { componentStack: errorInfo?.componentStack } });
    }
  }

  handleRetry = () => {
    this.setState({ isRetrying: true });
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          isRetrying={this.state.isRetrying}
        />
      );
    }
    return this.props.children;
  }
}

function ErrorBoundaryFallback({
  error,
  onRetry,
  isRetrying,
}: {
  error: Error;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const title = txt('shared.error.title');
  const message = txt(getErrorMessageKey(error));
  const backHomeLabel = txt('shared.error.backHome');
  const retryLabel = txt('shared.error.retry');
  const reloadingLabel = txt('shared.error.reloading');
  const devDetailLabel = txt('shared.error.devDetail');

  if (isRetrying) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 bg-muted/30">
        <div className="w-full max-w-md flex flex-col items-center justify-center py-12">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
            <Loader2 size={28} className="text-primary animate-spin" />
          </div>
          <p className="text-sm font-medium text-foreground">{reloadingLabel}</p>
          <p className="text-xs text-muted-foreground mt-1">Vui lòng đợi trong giây lát</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-md">
        <ErrorState
          title={title}
          message={message}
          onRetry={onRetry}
          retryLabel={retryLabel}
          primaryButtons
        />
        <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            {backHomeLabel}
          </a>
        </div>
        {import.meta.env.DEV && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-1">{devDetailLabel}</p>
            <pre className="p-3 text-xs bg-destructive/10 text-destructive rounded-lg overflow-auto max-h-32">
              {error.message}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default ErrorBoundaryClass;
