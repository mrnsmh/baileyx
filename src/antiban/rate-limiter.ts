import type { RateLimitState } from '../core/types.js'

export interface RateLimiterConfig {
  perMinute: number
  perHour: number
  perDay: number
  minDelayMs: number
  maxDelayMs: number
  /** Extra delay for first message to new chat. Default: 2500 */
  newChatDelayMs?: number
  /** Fast messages before rate limiting kicks in. Default: 3 */
  burstAllowance?: number
  /** Max identical messages in window. Default: 5 */
  maxIdenticalMessages?: number
  /** Window for identical message tracking (ms). Default: 3600000 */
  identicalMessageWindowMs?: number
}

export class RateLimiter {
  private state: RateLimitState
  private limits: {
    perMinute: number
    perHour: number
    perDay: number
    minDelayMs: number
    maxDelayMs: number
  }
  private newChatDelayMs: number
  private burstAllowance: number
  private maxIdenticalMessages: number
  private identicalMessageWindowMs: number
  private sentInMinute = 0
  private identicalTracker = new Map<string, number[]>() // text -> timestamps
  private knownChats = new Set<string>()

  constructor(config: RateLimiterConfig) {
    this.limits = {
      perMinute: config.perMinute,
      perHour: config.perHour,
      perDay: config.perDay,
      minDelayMs: config.minDelayMs,
      maxDelayMs: config.maxDelayMs,
    }
    this.newChatDelayMs = config.newChatDelayMs ?? 2500
    this.burstAllowance = config.burstAllowance ?? 3
    this.maxIdenticalMessages = config.maxIdenticalMessages ?? 5
    this.identicalMessageWindowMs = config.identicalMessageWindowMs ?? 3_600_000
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
  canSend(text?: string, isNewChat?: boolean): { allowed: boolean; delayMs: number; reason?: string } {
    this.resetIfNeeded()

    // Burst allowance: first N messages skip rate limit check
    if (this.state.sentMinute < this.burstAllowance) {
      const delayMs = this.computeDelay(text, isNewChat)
      return { allowed: true, delayMs }
    }

    if (this.state.sentMinute >= this.limits.perMinute) {
      return { allowed: false, delayMs: 0, reason: 'per-minute limit reached' }
    }
    if (this.state.sentHour >= this.limits.perHour) {
      return { allowed: false, delayMs: 0, reason: 'per-hour limit reached' }
    }
    if (this.state.sentDay >= this.limits.perDay) {
      return { allowed: false, delayMs: 0, reason: 'per-day limit reached' }
    }

    // Identical message detection
    if (text && this.isIdenticalBlocked(text)) {
      return { allowed: false, delayMs: 0, reason: 'identical message limit reached' }
    }

    const delayMs = this.computeDelay(text, isNewChat)
    return { allowed: true, delayMs }
  }

  private computeDelay(text?: string, isNewChat?: boolean): number {
    let delay = this.gaussianDelay()

    // New chat penalty
    if (isNewChat) {
      delay += this.newChatDelayMs
    }

    // Typing-based delay: ~30ms per character
    if (text && text.length > 20) {
      delay += text.length * 30
    }

    return delay
  }

  private isIdenticalBlocked(text: string): boolean {
    const normalized = text.trim().toLowerCase()
    const now = Date.now()
    const timestamps = this.identicalTracker.get(normalized) ?? []
    const recent = timestamps.filter(t => now - t < this.identicalMessageWindowMs)
    this.identicalTracker.set(normalized, recent)
    return recent.length >= this.maxIdenticalMessages
  }

  /**
   * Register a chat as known (for new-chat delay tracking).
   */
  markKnownChat(jid: string): void {
    this.knownChats.add(jid)
  }

  /**
   * Check if a chat is new.
   */
  isNewChat(jid: string): boolean {
    return !this.knownChats.has(jid)
  }

  record(text?: string): void {
    this.resetIfNeeded()
    this.state.sentMinute++
    this.state.sentHour++
    this.state.sentDay++

    if (text) {
      const normalized = text.trim().toLowerCase()
      const timestamps = this.identicalTracker.get(normalized) ?? []
      timestamps.push(Date.now())
      this.identicalTracker.set(normalized, timestamps)
    }
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
