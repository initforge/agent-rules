import '@/lib/text/bootstrap-module-strings';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import './index.css';
import App from './App';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { QueryDevtoolsPanel } from './components/dev/QueryDevtoolsPanel';
import { SERVER_GC_TIME_MS, SERVER_STALE_TIME_MS } from './lib/supabase/query-config';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn && typeof sentryDsn === 'string' && sentryDsn.trim() !== '') {
  const isProd = import.meta.env.PROD;
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE || 'production',
    enabled: true,
    integrations: isProd ? [Sentry.browserTracingIntegration()] : [],
    tracesSampleRate: isProd ? 0.1 : 0,
  });
}

// PWA: đăng ký SW + toast cập nhật/offline trong App (PwaRegister)

function queryErrorToast(error: unknown) {
  const msg =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Đã xảy ra lỗi';
  toast.error(msg);
}

function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /network|timeout|ECONNREFUSED|ETIMEDOUT|Failed to fetch|fetch/i.test(msg);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: queryErrorToast,
  }),
  defaultOptions: {
    queries: {
      staleTime: SERVER_STALE_TIME_MS,
      gcTime: SERVER_GC_TIME_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        return isRetryableError(error);
      },
    },
    mutations: {
      onError: queryErrorToast,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Router>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
          <QueryDevtoolsPanel />
        </QueryClientProvider>
      </ErrorBoundary>
    </Router>
  </React.StrictMode>
);