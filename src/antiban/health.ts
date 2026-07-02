import type { HealthStatus, BanRiskLevel } from '../core/types.js'

interface HealthConfig {
  autoPauseAt: BanRiskLevel
  maxDisconnectsPerHour: number
  maxFailedMessagesPerHour: number
  maxForbiddenErrors: number
}

const RISK_ORDER: BanRiskLevel[] = ['low', 'medium', 'high', 'critical']

export class HealthMonitor {
  private status: HealthStatus
  private config: HealthConfig
  private disconnectTimestamps: number[] = []
  private failedMessageTimestamps: number[] = []
  private forbiddenCount = 0
  private startTime: number

  constructor(config: Partial<HealthConfig> = {}) {
    this.config = {
      autoPauseAt: config.autoPauseAt ?? 'high',
      maxDisconnectsPerHour: config.maxDisconnectsPerHour ?? 5,
      maxFailedMessagesPerHour: config.maxFailedMessagesPerHour ?? 10,
      maxForbiddenErrors: config.maxForbiddenErrors ?? 3,
    }
    this.startTime = Date.now()
    this.status = {
      risk: 'low',
      score: 0,
      reasons: [],
      uptime: 0,
      failedMessages: 0,
      successfulMessages: 0,
    }
  }

  private cleanupOldEntries(): void {
    const oneHourAgo = Date.now() - 3_600_000
    this.disconnectTimestamps = this.disconnectTimestamps.filter(t => t > oneHourAgo)
    this.failedMessageTimestamps = this.failedMessageTimestamps.filter(t => t > oneHourAgo)
  }

  private computeRisk(): BanRiskLevel {
    this.cleanupOldEntries()

    let score = 0
    const reasons: string[] = []

    // Disconnect frequency
    if (this.disconnectTimestamps.length > this.config.maxDisconnectsPerHour) {
      score += 30
      reasons.push(`${this.disconnectTimestamps.length} disconnects in last hour`)
    }

    // Failed messages
    if (this.failedMessageTimestamps.length > this.config.maxFailedMessagesPerHour) {
      score += 25
      reasons.push(`${this.failedMessageTimestamps.length} failed messages in last hour`)
    }

    // Forbidden errors (403)
    if (this.forbiddenCount > 0) {
      score += this.forbiddenCount * 15
      reasons.push(`${this.forbiddenCount} forbidden (403) errors`)
    }

    // Delivery rate
    const total = this.status.successfulMessages + this.status.failedMessages
    if (total > 10) {
      const failureRate = this.status.failedMessages / total
      if (failureRate > 0.3) {
        score += 20
        reasons.push(`high failure rate: ${(failureRate * 100).toFixed(1)}%`)
      }
    }

    // Success decay: reduce score based on successful messages
    if (this.status.successfulMessages > 0 && score > 0) {
      const decay = Math.min(score, Math.floor(this.status.successfulMessages / 10))
      score = Math.max(0, score - decay)
    }

    // Determine risk level
    let risk: BanRiskLevel
    if (score >= 70) risk = 'critical'
    else if (score >= 40) risk = 'high'
    else if (score >= 15) risk = 'medium'
    else risk = 'low'

    this.status = {
      risk,
      score: Math.min(100, score),
      reasons,
      uptime: Date.now() - this.startTime,
      failedMessages: this.status.failedMessages,
      successfulMessages: this.status.successfulMessages,
    }

    return risk
  }

  onDisconnect(reason?: string): void {
    this.disconnectTimestamps.push(Date.now())
    this.status.lastDisconnect = reason ?? 'unknown'
    this.computeRisk()
  }

  onMessageFailed(): void {
    this.failedMessageTimestamps.push(Date.now())
    this.status.failedMessages++
    this.computeRisk()
  }

  onMessageSuccess(): void {
    this.status.successfulMessages++
    this.computeRisk()
  }

  onForbidden(): void {
    this.forbiddenCount++
    this.computeRisk()
  }

  shouldAutoPause(): boolean {
    const riskOrder = RISK_ORDER
    const currentIdx = riskOrder.indexOf(this.status.risk)
    const pauseIdx = riskOrder.indexOf(this.config.autoPauseAt)
    return currentIdx >= pauseIdx
  }

  getStatus(): HealthStatus {
    this.computeRisk()
    return { ...this.status }
  }

  reset(): void {
    this.disconnectTimestamps = []
    this.failedMessageTimestamps = []
    this.forbiddenCount = 0
    this.startTime = Date.now()
    this.status = {
      risk: 'low',
      score: 0,
      reasons: [],
      uptime: 0,
      failedMessages: 0,
      successfulMessages: 0,
    }
  }
}
