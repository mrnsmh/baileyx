/**
 * Disconnect classifier — typed reasons with recommended backoff.
 * Classifies disconnect status codes into categories.
 */

export type DisconnectCategory = 'fatal' | 'recoverable' | 'rate-limited' | 'unknown'

export interface DisconnectClassification {
  statusCode: number
  category: DisconnectCategory
  message: string
  shouldReconnect: boolean
  backoffMs?: number
}

const CLASSIFICATIONS: Record<number, Omit<DisconnectClassification, 'statusCode'>> = {
  401: { category: 'fatal', message: 'Logged out — session invalidated', shouldReconnect: false },
  408: { category: 'recoverable', message: 'Connection timed out', shouldReconnect: true, backoffMs: 5_000 },
  428: { category: 'recoverable', message: 'Connection replaced by another client', shouldReconnect: true, backoffMs: 10_000 },
  440: { category: 'fatal', message: 'Logged out by server', shouldReconnect: false },
  463: { category: 'rate-limited', message: 'Reachout timelock — messaging new contacts blocked', shouldReconnect: true, backoffMs: 60_000 },
  500: { category: 'recoverable', message: 'Internal server error', shouldReconnect: true, backoffMs: 10_000 },
  503: { category: 'recoverable', message: 'Service unavailable', shouldReconnect: true, backoffMs: 30_000 },
  515: { category: 'recoverable', message: 'Restart required', shouldReconnect: true, backoffMs: 5_000 },
}

/**
 * Classify a disconnect status code.
 */
export function classifyDisconnect(statusCode: number): DisconnectClassification {
  const known = CLASSIFICATIONS[statusCode]
  if (known) {
    return { statusCode, ...known }
  }

  // 429 = rate limited
  if (statusCode === 429) {
    return { statusCode, category: 'rate-limited', message: 'Rate limited by server', shouldReconnect: true, backoffMs: 60_000 }
  }

  // 1000 = graceful close
  if (statusCode === 1000) {
    return { statusCode, category: 'recoverable', message: 'Graceful close', shouldReconnect: true, backoffMs: 2_000 }
  }

  // 4xx = client error (usually fatal)
  if (statusCode >= 400 && statusCode < 500) {
    return { statusCode, category: 'fatal', message: `Client error ${statusCode}`, shouldReconnect: false }
  }

  // 5xx = server error (recoverable)
  if (statusCode >= 500) {
    return { statusCode, category: 'recoverable', message: `Server error ${statusCode}`, shouldReconnect: true, backoffMs: 15_000 }
  }

  return { statusCode, category: 'unknown', message: `Unknown error ${statusCode}`, shouldReconnect: true, backoffMs: 10_000 }
}

/**
 * Get recommended max retries based on category.
 */
export function getMaxRetries(category: DisconnectCategory): number {
  switch (category) {
    case 'fatal': return 0
    case 'rate-limited': return 3
    case 'recoverable': return 10
    case 'unknown': return 5
  }
}
