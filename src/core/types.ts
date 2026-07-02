import type { WASocket, WAMessage, WAMessageKey, ConnectionState, Contact, GroupMetadata, Chat, WAPresence } from 'baileys'

// ─── Config ────────────────────────────────────────────────────────────
export interface WhtspConfig {
  /** Auth storage directory (default: ./auth) */
  authDir: string
  /** Session name (for multi-session) */
  sessionId: string
  /** Anti-ban preset */
  preset: 'minimal' | 'balanced' | 'maximum'
  /** Max messages per minute */
  maxPerMinute: number
  /** Max messages per hour */
  maxPerHour: number
  /** Max messages per day */
  maxPerDay: number
  /** Min delay between messages (ms) */
  minDelayMs: number
  /** Max delay between messages (ms) */
  maxDelayMs: number
  /** Warmup days */
  warmupDays: number
  /** Day 1 message limit */
  warmupDay1Limit: number
  /** Growth factor per warmup day */
  warmupGrowthFactor: number
  /** Auto-pause at risk level */
  autoPauseAt: 'low' | 'medium' | 'high' | 'critical'
  /** Enable typing indicators */
  typingIndicators: boolean
  /** Enable read receipts */
  readReceipts: boolean
  /** Enable presence updates */
  presenceUpdates: boolean
  /** Log level */
  logLevel: 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
  /** API config */
  api: {
    enabled: boolean
    port: number
    host: string
    apiKey?: string
  }
  /** MCP config */
  mcp: {
    enabled: boolean
    transport: 'stdio' | 'http'
    port: number
  }
  /** Webhook URLs for events */
  webhooks: {
    onMessage?: string
    onConnect?: string
    onDisconnect?: string
    onBan?: string
  }
}

// ─── Anti-ban ──────────────────────────────────────────────────────────
export type BanRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface HealthStatus {
  risk: BanRiskLevel
  score: number
  reasons: string[]
  uptime: number
  lastDisconnect?: string
  failedMessages: number
  successfulMessages: number
}

export interface SendDecision {
  allowed: boolean
  delayMs: number
  reason?: string
  health: HealthStatus
}

export interface WarmUpState {
  day: number
  startDate: string
  totalSent: number
  lastSentAt?: string
}

export interface RateLimitState {
  sentMinute: number
  sentHour: number
  sentDay: number
  lastResetMinute: string
  lastResetHour: string
  lastResetDay: string
}

export interface AntiBanState {
  health: HealthStatus
  warmup: WarmUpState
  rateLimit: RateLimitState
  paused: boolean
  pauseReason?: string
  messages: {
    total: number
    blocked: number
    allowed: number
  }
}

// ─── Events ────────────────────────────────────────────────────────────
export type WhtspEvent =
  | 'connection.update'
  | 'messages.upsert'
  | 'messages.update'
  | 'contacts.upsert'
  | 'groups.upsert'
  | 'group-participants.update'
  | 'chats.upsert'
  | 'presence.update'
  | 'creds.update'

export interface MessageEvent {
  messages: WAMessage[]
  type: 'append' | 'notify'
}

export interface ConnectionEvent {
  connection: 'open' | 'connecting' | 'close'
  lastDisconnect?: { error: Error; date: Date }
  qr?: string
}

// ─── API ───────────────────────────────────────────────────────────────
export interface SendMessageRequest {
  to: string
  text?: string
  image?: string | Buffer
  video?: string | Buffer
  audio?: string | Buffer
  document?: string | Buffer
  fileName?: string
  mimetype?: string
  quoted?: WAMessage
  mentions?: string[]
}

export interface SendResponse {
  success: boolean
  messageId?: string
  error?: string
}

export interface StatusResponse {
  connected: boolean
  sessionId: string
  health: HealthStatus
  warmup: WarmUpState
  stats: {
    sent: number
    received: number
    blocked: number
  }
}

// ─── Wrapper ───────────────────────────────────────────────────────────
export interface WhtspClient {
  /** Raw Baileys socket (for advanced usage) */
  socket: WASocket
  /** Anti-ban state */
  antiBan: {
    getState(): AntiBanState
    pause(reason?: string): void
    resume(): void
    reset(): void
  }
  /** Send a text message */
  sendText(to: string, text: string, options?: { quoted?: WAMessage; mentions?: string[] }): Promise<WAMessage>
  /** Send an image */
  sendImage(to: string, image: Buffer | string, caption?: string): Promise<WAMessage>
  /** Send a video */
  sendVideo(to: string, video: Buffer | string, caption?: string): Promise<WAMessage>
  /** Send an audio */
  sendAudio(to: string, audio: Buffer | string, ptt?: boolean): Promise<WAMessage>
  /** Send a document */
  sendDocument(to: string, doc: Buffer | string, fileName: string, mimetype?: string): Promise<WAMessage>
  /** React to a message */
  react(to: string, emoji: string, key: WAMessageKey): Promise<void>
  /** Mark messages as read */
  readMessages(keys: WAMessageKey[]): Promise<void>
  /** Send presence update */
  sendPresence(presence: WAPresence, to?: string): Promise<void>
  /** Get contact info */
  getContact(jid: string): Promise<Contact | undefined>
  /** Get group metadata */
  getGroupMetadata(jid: string): Promise<GroupMetadata | undefined>
  /** Get chats */
  getChats(): Promise<Chat[]>
  /** Check if number exists on WhatsApp */
  isOnWhatsApp(phone: string): Promise<{ exists: boolean; jid: string }[]>
  /** Disconnect */
  disconnect(): Promise<void>
  /** Event listener */
  on(event: WhtspEvent, handler: (...args: any[]) => void): void
  /** Remove event listener */
  off(event: WhtspEvent, handler: (...args: any[]) => void): void
}
