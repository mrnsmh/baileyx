import type { WASocket, WAMessageKey } from 'baileys'
import type { AntiBanState, HealthStatus, WarmUpState, BanRiskLevel } from '../core/types.js'
import { RateLimiter } from './rate-limiter.js'
import { WarmUp } from './warmup.js'
import { HealthMonitor } from './health.js'
import { PresenceSimulator } from './presence.js'

export interface AntiBanConfig {
  preset?: 'minimal' | 'balanced' | 'maximum'
  maxPerMinute?: number
  maxPerHour?: number
  maxPerDay?: number
  minDelayMs?: number
  maxDelayMs?: number
  warmupDays?: number
  warmupDay1Limit?: number
  warmupGrowthFactor?: number
  autoPauseAt?: BanRiskLevel
  typingIndicators?: boolean
  readReceipts?: boolean
  presenceUpdates?: boolean
}

const PRESETS: Record<string, Partial<AntiBanConfig>> = {
  minimal: {
    maxPerMinute: 20,
    maxPerHour: 200,
    maxPerDay: 1000,
    minDelayMs: 800,
    maxDelayMs: 3000,
    warmupDays: 3,
    warmupDay1Limit: 50,
    autoPauseAt: 'critical',
  },
  balanced: {
    maxPerMinute: 10,
    maxPerHour: 100,
    maxPerDay: 500,
    minDelayMs: 1200,
    maxDelayMs: 5400,
    warmupDays: 7,
    warmupDay1Limit: 20,
    autoPauseAt: 'high',
  },
  maximum: {
    maxPerMinute: 5,
    maxPerHour: 50,
    maxPerDay: 200,
    minDelayMs: 2000,
    maxDelayMs: 8000,
    warmupDays: 14,
    warmupDay1Limit: 10,
    warmupGrowthFactor: 1.5,
    autoPauseAt: 'medium',
  },
}

export class AntiBan {
  private rateLimiter: RateLimiter
  private warmUp: WarmUp
  private healthMonitor: HealthMonitor
  private presence?: PresenceSimulator
  private paused = false
  private pauseReason?: string
  private messageStats = { total: 0, blocked: 0, allowed: 0 }
  private sock?: WASocket
  private config: AntiBanConfig

  constructor(config: AntiBanConfig = {}) {
    const preset = config.preset ?? 'balanced'
    const merged = { ...PRESETS[preset], ...config }
    this.config = merged

    this.rateLimiter = new RateLimiter({
      perMinute: merged.maxPerMinute!,
      perHour: merged.maxPerHour!,
      perDay: merged.maxPerDay!,
      minDelayMs: merged.minDelayMs!,
      maxDelayMs: merged.maxDelayMs!,
    })

    this.warmUp = new WarmUp({
      days: merged.warmupDays,
      day1Limit: merged.warmupDay1Limit,
      growthFactor: merged.warmupGrowthFactor,
    })

    this.healthMonitor = new HealthMonitor({
      autoPauseAt: merged.autoPauseAt,
    })
  }

  /**
   * Attach to a Baileys socket (enables presence simulation).
   */
  attach(sock: WASocket): void {
    this.sock = sock

    if (this.config.typingIndicators || this.config.presenceUpdates) {
      this.presence = new PresenceSimulator(sock)
    }

    // Hook into events
    sock.ev.on('connection.update', (update) => {
      if (update.connection === 'close') {
        const reason = (update.lastDisconnect?.error as any)?.output?.statusCode
        this.healthMonitor.onDisconnect(String(reason))
      }
    })
  }

  /**
   * Check if a message can be sent. Returns decision with delay.
   */
  async beforeSend(jid: string, content?: string): Promise<{
    allowed: boolean
    delayMs: number
    reason?: string
    health: HealthStatus
    warmupDay: number
  }> {
    this.messageStats.total++

    // 1. Check if paused
    if (this.paused) {
      this.messageStats.blocked++
      return {
        allowed: false,
        delayMs: 0,
        reason: this.pauseReason ?? 'manually paused',
        health: this.healthMonitor.getStatus(),
        warmupDay: this.warmUp.getState().day,
      }
    }

    // 2. Check health → auto-pause if needed
    const health = this.healthMonitor.getStatus()
    if (this.healthMonitor.shouldAutoPause()) {
      this.pause(`auto-paused: risk level ${health.risk}`)
      this.messageStats.blocked++
      return {
        allowed: false,
        delayMs: 0,
        reason: `auto-paused: risk level ${health.risk}`,
        health,
        warmupDay: this.warmUp.getState().day,
      }
    }

    // 3. Check warmup
    const warmupCheck = this.warmUp.canSend()
    if (!warmupCheck.allowed) {
      this.messageStats.blocked++
      return {
        allowed: false,
        delayMs: 0,
        reason: warmupCheck.reason,
        health,
        warmupDay: this.warmUp.getState().day,
      }
    }

    // 4. Check rate limiter
    const rateCheck = this.rateLimiter.canSend()
    if (!rateCheck.allowed) {
      this.messageStats.blocked++
      return {
        allowed: false,
        delayMs: 0,
        reason: rateCheck.reason,
        health,
        warmupDay: this.warmUp.getState().day,
      }
    }

    // 5. Simulate presence (typing indicator)
    if (this.presence && content) {
      await this.presence.preSend(jid)
    }

    this.messageStats.allowed++
    return {
      allowed: true,
      delayMs: rateCheck.delayMs,
      health,
      warmupDay: this.warmUp.getState().day,
    }
  }

  /**
   * Record a successful send.
   */
  afterSend(jid: string): void {
    this.rateLimiter.record()
    this.warmUp.record()
    this.healthMonitor.onMessageSuccess()

    if (this.presence) {
      this.presence.postSend(jid).catch(() => {})
    }
  }

  /**
   * Record a failed send.
   */
  afterSendFailed(): void {
    this.healthMonitor.onMessageFailed()
  }

  /**
   * Record a forbidden error.
   */
  onForbidden(): void {
    this.healthMonitor.onForbidden()
  }

  // ─── State ─────────────────────────────────────────────────────────
  getState(): AntiBanState {
    const health = this.healthMonitor.getStatus()
    return {
      health,
      warmup: this.warmUp.getState(),
      rateLimit: this.rateLimiter.getState(),
      paused: this.paused,
      pauseReason: this.pauseReason,
      messages: { ...this.messageStats },
    }
  }

  pause(reason?: string): void {
    this.paused = true
    this.pauseReason = reason ?? 'manually paused'
  }

  resume(): void {
    this.paused = false
    this.pauseReason = undefined
  }

  reset(): void {
    this.paused = false
    this.pauseReason = undefined
    this.messageStats = { total: 0, blocked: 0, allowed: 0 }
    this.rateLimiter.reset()
    this.warmUp.reset()
    this.healthMonitor.reset()
  }

  isPaused(): boolean {
    return this.paused
  }

  // ─── Persistence ───────────────────────────────────────────────────
  exportState(): AntiBanState {
    return this.getState()
  }

  importState(state: AntiBanState): void {
    this.warmUp.importState(state.warmup)
    this.rateLimiter.importState(state.rateLimit)
    this.paused = state.paused
    this.pauseReason = state.pauseReason
    this.messageStats = { ...state.messages }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────
  destroy(): void {
    this.presence?.stopPresenceCycling()
  }
}
