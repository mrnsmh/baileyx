import type { WASocket, WAPresence } from 'baileys'

export interface PresenceConfig {
  typingProbability: number
  composingDurationMs: [number, number]
  pauseBetweenTypingMs: [number, number]
  readReceiptDelayMs: [number, number]
  offlineGapMs: [number, number]
}

const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  typingProbability: 0.7,
  composingDurationMs: [1500, 4000],
  pauseBetweenTypingMs: [500, 2000],
  readReceiptDelayMs: [2000, 8000],
  offlineGapMs: [30_000, 120_000],
}

export class PresenceSimulator {
  private sock: WASocket
  private config: PresenceConfig
  private isOnline = false
  private cyclingTimer?: ReturnType<typeof setTimeout>
  private stopped = false

  constructor(sock: WASocket, config: Partial<PresenceConfig> = {}) {
    this.sock = sock
    this.config = { ...DEFAULT_PRESENCE_CONFIG, ...config }
  }

  private rand(min: number, max: number): number {
    return Math.round(min + Math.random() * (max - min))
  }

  /**
   * Simulate typing before sending a message.
   * Returns a promise that resolves when "typing" is done.
   */
  async simulateTyping(jid: string): Promise<void> {
    if (Math.random() > this.config.typingProbability) return

    try {
      await this.sock.sendPresenceUpdate('composing', jid)
      const duration = this.rand(...this.config.composingDurationMs)
      await new Promise(resolve => setTimeout(resolve, duration))
      await this.sock.sendPresenceUpdate('paused', jid)
    } catch {
      // Presence errors are non-fatal
    }
  }

  /**
   * Simulate reading a message after receiving it.
   */
  async simulateRead(jid: string): Promise<void> {
    const delay = this.rand(...this.config.readReceiptDelayMs)
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * Mark as available (online).
   */
  async goOnline(): Promise<void> {
    if (this.isOnline) return
    try {
      await this.sock.sendPresenceUpdate('available')
      this.isOnline = true
    } catch {
      // Non-fatal
    }
  }

  /**
   * Mark as unavailable (offline).
   */
  async goOffline(): Promise<void> {
    if (!this.isOnline) return
    try {
      await this.sock.sendPresenceUpdate('unavailable')
      this.isOnline = false
    } catch {
      // Non-fatal
    }
  }

  /**
   * Start periodic presence cycling (online/offline gaps).
   */
  startPresenceCycling(intervalMs?: number): void {
    this.stopped = false
    const gap = intervalMs ?? this.rand(...this.config.offlineGapMs)

    this.cyclingTimer = setTimeout(async () => {
      if (this.stopped) return

      try {
        if (this.isOnline) {
          await this.goOffline()
          if (this.stopped) return
          const offlineGap = this.rand(30_000, 60_000)
          this.cyclingTimer = setTimeout(() => this.startPresenceCycling(), offlineGap)
        } else {
          await this.goOnline()
          if (this.stopped) return
          this.startPresenceCycling()
        }
      } catch {
        // Non-fatal, retry after a longer delay
        if (!this.stopped) {
          this.cyclingTimer = setTimeout(() => this.startPresenceCycling(), 60_000)
        }
      }
    }, gap)
  }

  stopPresenceCycling(): void {
    this.stopped = true
    if (this.cyclingTimer) {
      clearTimeout(this.cyclingTimer)
      this.cyclingTimer = undefined
    }
  }

  /**
   * Simulate a full send flow: type -> wait -> send (caller handles actual send).
   */
  async preSend(jid: string): Promise<void> {
    await this.goOnline()
    await this.simulateTyping(jid)
  }

  /**
   * Post-send: pause typing indicator.
   */
  async postSend(jid: string): Promise<void> {
    try {
      await this.sock.sendPresenceUpdate('paused', jid)
    } catch {
      // Non-fatal
    }
  }
}
