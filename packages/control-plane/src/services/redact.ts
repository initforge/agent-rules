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

function isRedactableKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some(p => p.test(key))
}

export function redactSensitive(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => redactSensitive(item))
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isRedactableKey(key)) {
        result[key] = '[REDACTED]'
      } else {
        result[key] = redactSensitive(val)
      }
    }
    return result
  }
  return value
}

export function redactStringJson(input: string): string {
  try {
    const parsed = JSON.parse(input)
    if (parsed !== null && typeof parsed === 'object') {
      return JSON.stringify(redactSensitive(parsed))
    }
  } catch {}
  return input
}
