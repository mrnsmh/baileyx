import type { WarmUpState } from '../core/types.js'

export class WarmUp {
  private state: WarmUpState
  private config: {
    days: number
    day1Limit: number
    growthFactor: number
    inactivityThresholdHours: number
  }

  constructor(config: {
    days?: number
    day1Limit?: number
    growthFactor?: number
    inactivityThresholdHours?: number
  } = {}) {
    this.config = {
      days: config.days ?? 7,
      day1Limit: config.day1Limit ?? 20,
      growthFactor: config.growthFactor ?? 1.8,
      inactivityThresholdHours: config.inactivityThresholdHours ?? 48,
    }
    this.state = this.initState()
  }

  private initState(): WarmUpState {
    return {
      day: 1,
      startDate: new Date().toISOString(),
      totalSent: 0,
    }
  }

  /**
   * Get the message limit for the current warmup day.
   */
  getDayLimit(): number {
    return Math.round(this.config.day1Limit * Math.pow(this.config.growthFactor, this.state.day - 1))
  }

  /**
   * Check if we can send based on warmup limits.
   */
  canSend(): { allowed: boolean; limit: number; sent: number; day: number; reason?: string } {
    // Check inactivity reset
    if (this.state.lastSentAt) {
      const lastSent = new Date(this.state.lastSentAt)
      const hoursSince = (Date.now() - lastSent.getTime()) / 3_600_000
      if (hoursSince > this.config.inactivityThresholdHours) {
        // Reset warmup
        this.state = this.initState()
      }
    }

    const limit = this.getDayLimit()

    // Check if we've completed warmup
    if (this.state.day > this.config.days) {
      return { allowed: true, limit: Infinity, sent: this.state.totalSent, day: this.state.day }
    }

    if (this.state.totalSent >= limit) {
      return {
        allowed: false,
        limit,
        sent: this.state.totalSent,
        day: this.state.day,
        reason: `warmup day ${this.state.day}/${this.config.days}: ${this.state.totalSent}/${limit} messages sent`,
      }
    }

    return { allowed: true, limit, sent: this.state.totalSent, day: this.state.day }
  }

  record(): void {
    this.state.totalSent++
    this.state.lastSentAt = new Date().toISOString()

    // Auto-advance day when limit is reached
    if (this.state.day <= this.config.days) {
      const limit = this.getDayLimit()
      if (this.state.totalSent >= limit) {
        this.advanceDay()
      }
    }
  }

  advanceDay(): void {
    this.state.day++
    this.state.totalSent = 0
  }

  reset(): void {
    this.state = this.initState()
  }

  getState(): WarmUpState {
    return { ...this.state }
  }

  importState(state: WarmUpState): void {
    this.state = { ...state }
  }

  isComplete(): boolean {
    return this.state.day > this.config.days
  }

  getProgress(): { day: number; maxDays: number; sent: number; limit: number; percent: number } {
    const limit = this.getDayLimit()
    return {
      day: this.state.day,
      maxDays: this.config.days,
      sent: this.state.totalSent,
      limit,
      percent: Math.min(100, Math.round((this.state.day / this.config.days) * 100)),
    }
  }
}
