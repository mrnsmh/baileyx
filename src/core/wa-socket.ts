import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
  WAMessage,
  WAMessageKey,
  WAPresence,
  Contact,
  GroupMetadata,
  Chat,
} from 'baileys'
import pino from 'pino'
import { EventEmitter } from 'events'
import { AntiBan, AntiBanConfig } from '../antiban/index.js'
import type { WhtspConfig, WhtspClient, WhtspEvent, MessageEvent, ConnectionEvent } from './types.js'
import { mkdir } from 'fs/promises'
import { join } from 'path'

export interface CreateClientOptions {
  config?: Partial<WhtspConfig>
  antibanConfig?: AntiBanConfig
}

const MAX_RECONNECT_RETRIES = 10
const BASE_RECONNECT_DELAY_MS = 2_000
const MAX_RECONNECT_DELAY_MS = 60_000

export async function createWhtspClient(opts: CreateClientOptions = {}): Promise<WhtspClient> {
  const config = buildConfig(opts.config)
  const antiban = new AntiBan({
    preset: config.preset,
    maxPerMinute: config.maxPerMinute,
    maxPerHour: config.maxPerHour,
    maxPerDay: config.maxPerDay,
    minDelayMs: config.minDelayMs,
    maxDelayMs: config.maxDelayMs,
    warmupDays: config.warmupDays,
    warmupDay1Limit: config.warmupDay1Limit,
    warmupGrowthFactor: config.warmupGrowthFactor,
    autoPauseAt: config.autoPauseAt,
    typingIndicators: config.typingIndicators,
    readReceipts: config.readReceipts,
    presenceUpdates: config.presenceUpdates,
    ...opts.antibanConfig,
  })

  // Ensure auth directory exists
  const authDir = join(config.authDir, config.sessionId)
  await mkdir(authDir, { recursive: true })

  // Logger
  const logger = pino({ level: config.logLevel })

  // Event emitter for custom events
  const eventEmitter = new EventEmitter()

  // Reconnect state
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let currentSock: WASocket | null = null
  let destroyed = false

  function setupSocketListeners(sock: WASocket): void {
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode

        if (statusCode === DisconnectReason.loggedOut) {
          eventEmitter.emit('connection.update', { connection: 'close', lastDisconnect } as ConnectionEvent)
        } else if (!destroyed) {
          scheduleReconnect()
        }
      }

      if (connection === 'open') {
        reconnectAttempts = 0
        eventEmitter.emit('connection.update', { connection: 'open' } as ConnectionEvent)
      }

      if (qr) {
        eventEmitter.emit('connection.update', { connection: 'connecting', qr } as ConnectionEvent)
      }
    })

    sock.ev.on('creds.update', async () => {
      // Re-save creds after reconnect
      try {
        const { state, saveCreds } = await useMultiFileAuthState(authDir)
        await saveCreds()
      } catch {
        // Non-fatal
      }
    })

    sock.ev.on('messages.upsert', (msg) => {
      const event: MessageEvent = { messages: msg.messages, type: msg.type }
      eventEmitter.emit('messages.upsert', event)
    })
  }

  function scheduleReconnect(): void {
    if (destroyed) return
    if (reconnectAttempts >= MAX_RECONNECT_RETRIES) {
      eventEmitter.emit('connection.update', { connection: 'close', lastDisconnect: { error: new Error('max retries exceeded'), date: new Date() } } as ConnectionEvent)
      return
    }

    reconnectAttempts++
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS,
    )

    reconnectTimer = setTimeout(async () => {
      if (destroyed) return
      try {
        await doConnect()
      } catch {
        scheduleReconnect()
      }
    }, delay)
  }

  async function doConnect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: ['Whtsp', 'Chrome', '4.0.0'],
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
    })

    antiban.attach(sock)
    setupSocketListeners(sock)
    currentSock = sock
  }

  // Initial connect
  await doConnect()

  // ─── Helper: wait for delay ────────────────────────────────────────
  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function getSocket(): WASocket {
    if (!currentSock) throw new Error('Socket not connected')
    return currentSock
  }

  // ─── Client API ────────────────────────────────────────────────────
  const client: WhtspClient = {
    get socket() { return getSocket() },

    antiBan: {
      getState: () => antiban.getState(),
      pause: (reason?: string) => antiban.pause(reason),
      resume: () => antiban.resume(),
      reset: () => antiban.reset(),
    },

    async sendText(to, text, options) {
      const decision = await antiban.beforeSend(to, text)
      if (!decision.allowed) {
        throw new Error(`Blocked: ${decision.reason}`)
      }
      await sleep(decision.delayMs)
      const sock = getSocket()
      const msg = await sock.sendMessage(to, { text }, { quoted: options?.quoted })
      antiban.afterSend(to)
      return msg!
    },

    async sendImage(to, image, caption) {
      const decision = await antiban.beforeSend(to)
      if (!decision.allowed) {
        throw new Error(`Blocked: ${decision.reason}`)
      }
      await sleep(decision.delayMs)
      const sock = getSocket()
      const content = typeof image === 'string'
        ? { image: { url: image }, caption }
        : { image, caption }
      const msg = await sock.sendMessage(to, content)
      antiban.afterSend(to)
      return msg!
    },

    async sendVideo(to, video, caption) {
      const decision = await antiban.beforeSend(to)
      if (!decision.allowed) {
        throw new Error(`Blocked: ${decision.reason}`)
      }
      await sleep(decision.delayMs)
      const sock = getSocket()
      const content = typeof video === 'string'
        ? { video: { url: video }, caption }
        : { video, caption }
      const msg = await sock.sendMessage(to, content)
      antiban.afterSend(to)
      return msg!
    },

    async sendAudio(to, audio, ptt = false) {
      const decision = await antiban.beforeSend(to)
      if (!decision.allowed) {
        throw new Error(`Blocked: ${decision.reason}`)
      }
      await sleep(decision.delayMs)
      const sock = getSocket()
      const content = typeof audio === 'string'
        ? { audio: { url: audio }, ptt }
        : { audio, ptt }
      const msg = await sock.sendMessage(to, content)
      antiban.afterSend(to)
      return msg!
    },

    async sendDocument(to, doc, fileName, mimetype = 'application/pdf') {
      const decision = await antiban.beforeSend(to)
      if (!decision.allowed) {
        throw new Error(`Blocked: ${decision.reason}`)
      }
      await sleep(decision.delayMs)
      const sock = getSocket()
      const content = typeof doc === 'string'
        ? { document: { url: doc }, fileName, mimetype }
        : { document: doc, fileName, mimetype }
      const msg = await sock.sendMessage(to, content)
      antiban.afterSend(to)
      return msg!
    },

    async react(to, emoji, key) {
      const sock = getSocket()
      await sock.sendMessage(to, { react: { text: emoji, key } })
    },

    async readMessages(keys) {
      const sock = getSocket()
      await sock.readMessages(keys)
    },

    async sendPresence(presence, to) {
      const sock = getSocket()
      await sock.sendPresenceUpdate(presence, to)
    },

    async getContact(jid) {
      return undefined
    },

    async getGroupMetadata(jid) {
      const sock = getSocket()
      return sock.groupMetadata(jid)
    },

    async getChats() {
      return []
    },

    async isOnWhatsApp(phone) {
      const clean = phone.replace(/[^0-9]/g, '')
      const sock = getSocket()
      const result = await sock.onWhatsApp(clean)
      return result ?? []
    },

    async disconnect() {
      destroyed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
      antiban.destroy()
      try {
        currentSock?.end(undefined)
      } catch {
        // Non-fatal
      }
    },

    on(event, handler) {
      eventEmitter.on(event, handler)
    },

    off(event, handler) {
      eventEmitter.off(event, handler)
    },
  }

  return client
}

function buildConfig(partial?: Partial<WhtspConfig>): WhtspConfig {
  return {
    authDir: partial?.authDir ?? './auth',
    sessionId: partial?.sessionId ?? 'default',
    preset: partial?.preset ?? 'balanced',
    maxPerMinute: partial?.maxPerMinute ?? 10,
    maxPerHour: partial?.maxPerHour ?? 100,
    maxPerDay: partial?.maxPerDay ?? 500,
    minDelayMs: partial?.minDelayMs ?? 1200,
    maxDelayMs: partial?.maxDelayMs ?? 5400,
    warmupDays: partial?.warmupDays ?? 7,
    warmupDay1Limit: partial?.warmupDay1Limit ?? 20,
    warmupGrowthFactor: partial?.warmupGrowthFactor ?? 1.8,
    autoPauseAt: partial?.autoPauseAt ?? 'high',
    typingIndicators: partial?.typingIndicators ?? true,
    readReceipts: partial?.readReceipts ?? true,
    presenceUpdates: partial?.presenceUpdates ?? true,
    logLevel: partial?.logLevel ?? 'info',
    api: {
      enabled: partial?.api?.enabled ?? false,
      port: partial?.api?.port ?? 3010,
      host: partial?.api?.host ?? '0.0.0.0',
      apiKey: partial?.api?.apiKey,
    },
    mcp: {
      enabled: partial?.mcp?.enabled ?? false,
      transport: partial?.mcp?.transport ?? 'stdio',
      port: partial?.mcp?.port ?? 3011,
    },
    webhooks: partial?.webhooks ?? {},
  }
}
