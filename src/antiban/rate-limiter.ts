import type { RateLimitState } from '../core/types.js'

export class RateLimiter {
  private state: RateLimitState
  private limits: {
    perMinute: number
    perHour: number
    perDay: number
    minDelayMs: number
    maxDelayMs: number
  }

  constructor(config: {
    perMinute: number
    perHour: number
    perDay: number
    minDelayMs: number
    maxDelayMs: number
  }) {
    this.limits = config
    this.state = this.initState()
  }

  private initState(): RateLimitState {
    const now = new Date().toISOString()
    return {
      sentMinute: 0,
      sentHour: 0,
      sentDay: 0,
      lastResetMinute: now,
      lastResetHour: now,
      lastResetDay: now,
    }
  }

  private resetIfNeeded(): void {
    const now = new Date()

    // Reset minute counter
    const lastResetMinute = new Date(this.state.lastResetMinute)
    if (now.getTime() - lastResetMinute.getTime() >= 60_000) {
      this.state.sentMinute = 0
      this.state.lastResetMinute = now.toISOString()
    }

    // Reset hour counter
    const lastResetHour = new Date(this.state.lastResetHour)
    if (now.getTime() - lastResetHour.getTime() >= 3_600_000) {
      this.state.sentHour = 0
      this.state.lastResetHour = now.toISOString()
    }

    // Reset day counter
    const lastResetDay = new Date(this.state.lastResetDay)
    if (now.getTime() - lastResetDay.getTime() >= 86_400_000) {
      this.state.sentDay = 0
      this.state.lastResetDay = now.toISOString()
    }
  }

  /**
   * Check if we can send and compute delay with Gaussian jitter.
   * Returns { allowed, delayMs, reason? }
   */
  canSend(): { allowed: boolean; delayMs: number; reason?: string } {
    this.resetIfNeeded()

    if (this.state.sentMinute >= this.limits.perMinute) {
      return { allowed: false, delayMs: 0, reason: 'per-minute limit reached' }
    }
    if (this.state.sentHour >= this.limits.perHour) {
      return { allowed: false, delayMs: 0, reason: 'per-hour limit reached' }
    }
    if (this.state.sentDay >= this.limits.perDay) {
      return { allowed: false, delayMs: 0, reason: 'per-day limit reached' }
    }

    const delayMs = this.gaussianDelay()
    return { allowed: true, delayMs }
  }

  record(): void {
    this.resetIfNeeded()
    this.state.sentMinute++
    this.state.sentHour++
    this.state.sentDay++
  }

  getState(): RateLimitState {
    this.resetIfNeeded()
    return { ...this.state }
  }

  /**
   * Gaussian-distributed random delay between minDelay and maxDelay.
   * Uses Box-Muller transform for natural distribution.
   */
  private gaussianDelay(): number {
    const { minDelayMs, maxDelayMs } = this.limits
    const mid = (minDelayMs + maxDelayMs) / 2
    const sigma = (maxDelayMs - minDelayMs) / 6 // 99.7% within range

    // Box-Muller transform (guard against Math.log(0))
    const u1 = Math.random() || 1e-10
    const u2 = Math.random()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

    let delay = mid + z * sigma
    delay = Math.max(minDelayMs, Math.min(maxDelayMs, delay))
    return Math.round(delay)
  }

  /**
   * Scale limits by a factor (for warmup or adaptive throttling).
   * Clamps current counters to new limits if they exceed.
   */
  scaleLimits(factor: number): void {
    this.limits.perMinute = Math.round(this.limits.perMinute * factor)
    this.limits.perHour = Math.round(this.limits.perHour * factor)
    this.limits.perDay = Math.round(this.limits.perDay * factor)

    // Clamp counters to new limits
    this.state.sentMinute = Math.min(this.state.sentMinute, this.limits.perMinute)
    this.state.sentHour = Math.min(this.state.sentHour, this.limits.perHour)
    this.state.sentDay = Math.min(this.state.sentDay, this.limits.perDay)
  }

  reset(): void {
    this.state = this.initState()
  }

  importState(state: RateLimitState): void {
    this.state = { ...state }
  }
}
