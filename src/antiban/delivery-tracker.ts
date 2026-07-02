/**
 * Delivery tracker — monitors double-tick receipts to detect soft bans.
 * <60% delivery rate is a soft-ban signal.
 */

export interface DeliveryTrackerConfig {
  /** Delivery rate threshold to trigger warning. Default: 0.6 */
  lowRateThreshold: number
  /** Minimum messages before tracking. Default: 10 */
  minMessagesForTracking: number
}

const DEFAULT_CONFIG: DeliveryTrackerConfig = {
  lowRateThreshold: 0.6,
  minMessagesForTracking: 10,
}

export class DeliveryTracker {
  private sent = new Map<string, number>() // messageId -> sentAt
  private delivered = new Set<string>()
  private totalSent = 0
  private totalDelivered = 0
  private config: DeliveryTrackerConfig
  private onLowRate?: (rate: number) => void

  constructor(config: Partial<DeliveryTrackerConfig> & { onLowRate?: (rate: number) => void } = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.onLowRate = config.onLowRate
  }

  /**
   * Record that a message was sent.
   */
  onMessageSent(messageId: string): void {
    this.sent.set(messageId, Date.now())
    this.totalSent++
  }

  /**
   * Record a delivery receipt (double-tick).
   */
  onDeliveryReceipt(messageId: string): void {
    if (this.sent.has(messageId) && !this.delivered.has(messageId)) {
      this.delivered.add(messageId)
      this.totalDelivered++
    }
  }

  /**
   * Get the current delivery rate (0-1).
   */
  getDeliveryRate(): number {
    if (this.totalSent < this.config.minMessagesForTracking) return 1.0
    return this.totalDelivered / Math.max(1, this.totalSent)
  }

  /**
   * Check if delivery rate is concerning.
   */
  isLowDelivery(): boolean {
    if (this.totalSent < this.config.minMessagesForTracking) return false
    const rate = this.getDeliveryRate()
    if (rate < this.config.lowRateThreshold) {
      this.onLowRate?.(rate)
      return true
    }
    return false
  }

  /**
   * Get stats.
   */
  getStats(): { sent: number; delivered: number; rate: number; isLow: boolean } {
    return {
      sent: this.totalSent,
      delivered: this.totalDelivered,
      rate: this.getDeliveryRate(),
      isLow: this.isLowDelivery(),
    }
  }

  /**
   * Clean up old entries (call periodically).
   */
  cleanup(maxAgeMs: number = 3_600_000): void {
    const cutoff = Date.now() - maxAgeMs
    for (const [id, sentAt] of this.sent) {
      if (sentAt < cutoff) {
        this.sent.delete(id)
        this.delivered.delete(id)
      }
    }
  }

  reset(): void {
    this.sent.clear()
    this.delivered.clear()
    this.totalSent = 0
    this.totalDelivered = 0
  }
}
