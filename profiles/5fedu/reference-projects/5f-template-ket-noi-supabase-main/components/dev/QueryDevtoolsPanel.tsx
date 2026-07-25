import { lazy, Suspense } from 'react';

/** Tải Devtools async — tránh pre-bundle chính lệch hash (Vite "Outdated Optimize Dep"). */
const ReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })),
);

export function QueryDevtoolsPanel() {
  if (!import.meta.env.DEV) return null;
  return (
    <Suspense fallback={null}>
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </Suspense>
  );
}
