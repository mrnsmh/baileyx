/**
 * Contact graph enforcement.
 * Tracks reply ratios and contact relationships to avoid "spray-and-pray" patterns.
 * WhatsApp ML heavily weights reply-ratio (<10% = high risk) and contact distance.
 */

export type ContactRelation = 'stranger' | 'handshake_sent' | 'handshake_complete' | 'known'

interface ContactInfo {
  relation: ContactRelation
  outboundCount: number
  inboundCount: number
  lastOutboundAt?: number
  lastInboundAt?: number
  firstSeenAt: number
}

export interface ContactGraphConfig {
  /** Minimum reply ratio before blocking. Default: 0.10 */
  minReplyRatio: number
  /** Outbound messages before enforcing ratio. Default: 5 */
  minMessagesBeforeEnforce: number
  /** Cooldown hours on ratio violation. Default: 24 */
  cooldownHoursOnViolation: number
  /** Extra delay multiplier for strangers. Default: 2.5 */
  strangerDelayMultiplier: number
  /** Extra delay multiplier for handshake_sent. Default: 1.8 */
  handshakeSentMultiplier: number
  /** Extra delay multiplier for handshake_complete. Default: 1.3 */
  handshakeCompleteMultiplier: number
  /** Min delay between handshake and first real message (ms). Default: 1h */
  handshakeMinDelayMs: number
  /** Max new contacts per day. Default: 20 */
  maxNewContactsPerDay: number
}

const DEFAULT_CONFIG: ContactGraphConfig = {
  minReplyRatio: 0.10,
  minMessagesBeforeEnforce: 5,
  cooldownHoursOnViolation: 24,
  strangerDelayMultiplier: 2.5,
  handshakeSentMultiplier: 1.8,
  handshakeCompleteMultiplier: 1.3,
  handshakeMinDelayMs: 3_600_000,
  maxNewContactsPerDay: 20,
}

export class ContactGraph {
  private contacts = new Map<string, ContactInfo>()
  private blockedJids = new Map<string, number>() // jid -> unblock timestamp
  private newContactsToday = 0
  private lastDayReset = Date.now()
  private config: ContactGraphConfig

  constructor(config: Partial<ContactGraphConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Record an incoming message from a contact.
   */
  onIncomingMessage(jid: string): void {
    this.resetDayIfNeeded()
    const info = this.getOrCreate(jid)
    info.inboundCount++
    info.lastInboundAt = Date.now()

    if (info.relation === 'stranger') {
      info.relation = 'handshake_sent'
    }
  }

  /**
   * Record that we sent a message to a contact.
   */
  onOutgoingMessage(jid: string): void {
    this.resetDayIfNeeded()
    const info = this.getOrCreate(jid)
    info.outboundCount++
    info.lastOutboundAt = Date.now()

    if (info.relation === 'stranger') {
      this.newContactsToday++
    }
  }

  /**
   * Mark handshake as complete (contact replied after we initiated).
   */
  markHandshakeComplete(jid: string): void {
    const info = this.getOrCreate(jid)
    if (info.relation === 'handshake_sent') {
      info.relation = 'handshake_complete'
    }
  }

  /**
   * Mark contact as known (frequent interaction).
   */
  markKnown(jid: string): void {
    const info = this.getOrCreate(jid)
    if (info.inboundCount >= 3 && info.outboundCount >= 3) {
      info.relation = 'known'
    }
  }

  /**
   * Record that a contact blocked us.
   */
  onBlocked(jid: string): void {
    const info = this.getOrCreate(jid)
    info.relation = 'stranger'
    this.blockedJids.set(jid, Date.now() + 24 * 3_600_000)
  }

  /**
   * Check if we can message this contact.
   */
  canMessage(jid: string): { allowed: boolean; delayMultiplier: number; reason?: string } {
    this.resetDayIfNeeded()

    // Check if blocked
    const unblockAt = this.blockedJids.get(jid)
    if (unblockAt && Date.now() < unblockAt) {
      return { allowed: false, delayMultiplier: 0, reason: 'contact blocked us recently' }
    }
    this.blockedJids.delete(jid)

    // Check new contacts per day
    const info = this.getOrCreate(jid)
    if (info.relation === 'stranger' && this.newContactsToday >= this.config.maxNewContactsPerDay) {
      return { allowed: false, delayMultiplier: 0, reason: 'max new contacts per day reached' }
    }

    // Check reply ratio
    if (info.outboundCount >= this.config.minMessagesBeforeEnforce) {
      const ratio = info.inboundCount / Math.max(1, info.outboundCount)
      if (ratio < this.config.minReplyRatio) {
        const cooldownMs = this.config.cooldownHoursOnViolation * 3_600_000
        this.blockedJids.set(jid, Date.now() + cooldownMs)
        return { allowed: false, delayMultiplier: 0, reason: `reply ratio too low: ${(ratio * 100).toFixed(1)}%` }
      }
    }

    // Check handshake delay
    if (info.relation === 'handshake_sent' && info.lastOutboundAt) {
      const elapsed = Date.now() - info.lastOutboundAt
      if (elapsed < this.config.handshakeMinDelayMs) {
        return { allowed: false, delayMultiplier: 0, reason: 'handshake min delay not reached' }
      }
    }

    // Get delay multiplier based on relation
    const multiplier = this.getMultiplier(info.relation)

    return { allowed: true, delayMultiplier: multiplier }
  }

  /**
   * Get the delay multiplier for a contact.
   */
  getDelayMultiplier(jid: string): number {
    const info = this.contacts.get(jid)
    return info ? this.getMultiplier(info.relation) : this.config.strangerDelayMultiplier
  }

  /**
   * Get contact stats.
   */
  getStats(): { totalContacts: number; byRelation: Record<ContactRelation, number> } {
    const byRelation: Record<ContactRelation, number> = { stranger: 0, handshake_sent: 0, handshake_complete: 0, known: 0 }
    for (const info of this.contacts.values()) {
      byRelation[info.relation]++
    }
    return { totalContacts: this.contacts.size, byRelation }
  }

  private getMultiplier(relation: ContactRelation): number {
    switch (relation) {
      case 'stranger': return this.config.strangerDelayMultiplier
      case 'handshake_sent': return this.config.handshakeSentMultiplier
      case 'handshake_complete': return this.config.handshakeCompleteMultiplier
      case 'known': return 1.0
    }
  }

  private getOrCreate(jid: string): ContactInfo {
    let info = this.contacts.get(jid)
    if (!info) {
      info = { relation: 'stranger', outboundCount: 0, inboundCount: 0, firstSeenAt: Date.now() }
      this.contacts.set(jid, info)
    }
    return info
  }

  private resetDayIfNeeded(): void {
    const now = Date.now()
    if (now - this.lastDayReset >= 86_400_000) {
      this.newContactsToday = 0
      this.lastDayReset = now
    }
  }
}
