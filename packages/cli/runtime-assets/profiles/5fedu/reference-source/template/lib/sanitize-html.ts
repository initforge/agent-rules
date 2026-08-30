import DOMPurify from 'dompurify';

const BASE: DOMPurify.Config = {
  USE_PROFILES: { html: true },
};

/**
 * Sanitize untrusted HTML before `dangerouslySetInnerHTML`.
 * Keeps common rich-text tags from editors; strips scripts and event handlers.
 */
export function sanitizeHtml(dirty: string, extra?: DOMPurify.Config): string {
  if (!dirty?.trim()) return '';
  return DOMPurify.sanitize(dirty, { ...BASE, ...extra });
}
