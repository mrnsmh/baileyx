/**
 * Post-reconnect throttle — ramps up sending rate slowly after reconnect.
 * Prevents burst-floods that trigger rate limit alarms.
 */

export interface ReconnectThrottleConfig {
  /** Ramp-up duration in ms. Default: 60000 (60s) */
  rampDurationMs: number
  /** Starting rate multiplier (0-1). Default: 0.1 */
  initialRateMultiplier: number
  /** Number of ramp steps. Default: 6 */
  rampSteps: number
}

const DEFAULT_CONFIG: ReconnectThrottleConfig = {
  rampDurationMs: 60_000,
  initialRateMultiplier: 0.1,
  rampSteps: 6,
}

export class ReconnectThrottle {
  private config: ReconnectThrottleConfig
  private isThrottled = false
  private throttleStart = 0
  private currentMultiplier = 1.0
  private throttledSendCount = 0

  constructor(config: Partial<ReconnectThrottleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Call when reconnect happens. Starts the throttle ramp.
   */
  onReconnect(): void {
    this.isThrottled = true
    this.throttleStart = Date.now()
    this.currentMultiplier = this.config.initialRateMultiplier
    this.throttledSendCount = 0
  }

  /**
   * Get the current delay multiplier (0.1 = 10% speed, 1.0 = full speed).
   */
  getMultiplier(): number {
    if (!this.isThrottled) return 1.0

    const elapsed = Date.now() - this.throttleStart
    if (elapsed >= this.config.rampDurationMs) {
      this.isThrottled = false
      this.currentMultiplier = 1.0
      return 1.0
    }

    const step = Math.floor((elapsed / this.config.rampDurationMs) * this.config.rampSteps)
    const range = 1.0 - this.config.initialRateMultiplier
    this.currentMultiplier = this.config.initialRateMultiplier + (range * step) / this.config.rampSteps
    return this.currentMultiplier
  }

  /**
   * Apply throttle to a delay.
   */
  applyThrottle(delayMs: number): number {
    const multiplier = this.getMultiplier()
    if (multiplier < 1.0) {
      this.throttledSendCount++
      return Math.round(delayMs / multiplier)
    }
    return delayMs
  }

  /**
   * Check if currently throttled.
   */
  getIsThrottled(): boolean {
    return this.isThrottled
  }

  /**
   * Get remaining throttle time in ms.
   */
  getRemainingMs(): number {
    if (!this.isThrottled) return 0
    const elapsed = Date.now() - this.throttleStart
    return Math.max(0, this.config.rampDurationMs - elapsed)
  }

  /**
   * Get stats.
   */
  getStats(): { isThrottled: boolean; currentMultiplier: number; remainingMs: number; throttledSendCount: number } {
    return {
      isThrottled: this.isThrottled,
      currentMultiplier: this.getMultiplier(),
      remainingMs: this.getRemainingMs(),
      throttledSendCount: this.throttledSendCount,
    }
  }

  reset(): void {
    this.isThrottled = false
    this.currentMultiplier = 1.0
    this.throttledSendCount = 0
  }
}
