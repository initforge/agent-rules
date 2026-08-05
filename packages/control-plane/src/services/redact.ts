// Synchronized with engine ANOMALY_PATTERNS and VALUE_REDACTION_PATTERNS
const SENSITIVE_PATTERNS = [
  /api[_-]?key/gi,
  /secret/gi,
  /password/gi,
  /token/gi,
  /authorization/gi,
  /auth/gi,
  /private[_-]?key/gi,
  /access[_-]?key/gi,
  /session[_-]?id/gi,
  /credential/gi,
  /bearer/gi,
]

/**
 * Value-redaction patterns. Each captures the key and separator in group 1 and the
 * secret in group 2, so the replacement keeps `password=` and masks only the value.
 *
 * These previously replaced the whole match with `[REDACTED]`, erasing the field name
 * along with the secret. That makes a redacted log unreadable — you can no longer tell
 * whether a token or a password was present — while protecting nothing extra, since the
 * key name is not the sensitive part.
 */
const VALUE_REDACTION_PATTERNS: readonly [RegExp, string][] = [
  [/((?:password|secret|token|api[_-]?key|private[_-]?key)\s*[:=]\s*)(\S+)/gi, '$1[REDACTED]'],
  [/((?:aws|gcp|azure)[_-]?(?:secret|key|token)\s*[:=]\s*)(\S+)/gi, '$1[REDACTED]'],
  // `Authorization: Bearer <jwt>` first: the scheme word sits between the key and the
  // secret, so the single-token pattern below would mask "Bearer" and leave the JWT.
  [/((?:authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic|digest|token)\s+)(\S+)/gi, '$1[REDACTED]'],
  [/((?:bearer|authorization)\s*[:=]\s*)(\S+)/gi, '$1[REDACTED]'],
  [/((?:npm|pip|maven|gradle)\s+(?:token|key|auth)\s*[:=]\s*)(\S+)/gi, '$1[REDACTED]'],
]

function isRedactableKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some(p => {
    p.lastIndex = 0
    return p.test(key)
  })
}

export interface RedactionResult {
  readonly redacted: unknown;
  readonly hadRedactions: boolean;
}

export function redactSensitive(value: unknown): RedactionResult {
  if (value === null || value === undefined) return { redacted: value, hadRedactions: false }
  if (typeof value === 'string') {
    return { redacted: value, hadRedactions: false }
  }
  if (Array.isArray(value)) {
    const results = value.map(item => redactSensitive(item))
    return {
      redacted: results.map(r => r.redacted),
      hadRedactions: results.some(r => r.hadRedactions),
    }
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    let hadRedactions = false
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isRedactableKey(key)) {
        result[key] = '[REDACTED]'
        hadRedactions = true
      } else {
        const nested = redactSensitive(val)
        result[key] = nested.redacted
        hadRedactions = hadRedactions || nested.hadRedactions
      }
    }
    return { redacted: result, hadRedactions }
  }
  return { redacted: value, hadRedactions: false }
}

/** Legacy export for backward compatibility */
export function redactSensitiveValue(value: unknown): unknown {
  return redactSensitive(value).redacted
}

export function redactStringJson(input: string): string {
  try {
    const parsed = JSON.parse(input)
    if (parsed !== null && typeof parsed === 'object') {
      return JSON.stringify(redactSensitive(parsed).redacted)
    }
  } catch {}
  return input
}

/**
 * Redact secret-like values from plain text content.
 * Replaces patterns like `password=secret` with `password=[REDACTED]`.
 */
export function redactTextContent(content: string): string {
  let redacted = content
  for (const [pattern, replacement] of VALUE_REDACTION_PATTERNS) {
    pattern.lastIndex = 0
    redacted = redacted.replace(pattern, replacement)
  }
  return redacted
}

/**
 * Check if content contains sensitive patterns.
 */
export function containsSensitiveContent(content: string): boolean {
  for (const [pattern] of VALUE_REDACTION_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(content)) return true
  }
  return false
}
