import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, } from 'baileys';
import pino from 'pino';
import { EventEmitter } from 'events';
import { AntiBan } from '../antiban/index.js';
import { mkdir } from 'fs/promises';
import { join } from 'path';
export async function createWhtspClient(opts = {}) {
    const config = buildConfig(opts.config);
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
    });
    // Ensure auth directory exists
    const authDir = join(config.authDir, config.sessionId);
    await mkdir(authDir, { recursive: true });
    // Load auth state
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    // Fetch latest version
    const { version } = await fetchLatestBaileysVersion();
    // Logger
    const logger = pino({ level: config.logLevel });
    // Create socket
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
    });
    // Attach anti-ban
    antiban.attach(sock);
    // Event emitter for custom events
    const eventEmitter = new EventEmitter();
    // Connection handler
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                eventEmitter.emit('connection.update', { connection: 'close', lastDisconnect });
            }
            else {
                // Reconnect
                await reconnect();
            }
        }
        if (connection === 'open') {
            eventEmitter.emit('connection.update', { connection: 'open' });
        }
        if (qr) {
            eventEmitter.emit('connection.update', { connection: 'connecting', qr });
        }
    });
    // Save creds on update
    sock.ev.on('creds.update', saveCreds);
    // Message handler
    sock.ev.on('messages.upsert', (msg) => {
        const event = { messages: msg.messages, type: msg.type };
        eventEmitter.emit('messages.upsert', event);
    });
    // Reconnect function
    async function reconnect() {
        const authDir = join(config.authDir, config.sessionId);
        const { state: newState, saveCreds: newSaveCreds } = await useMultiFileAuthState(authDir);
        const { version: newVersion } = await fetchLatestBaileysVersion();
        const newSock = makeWASocket({
            version: newVersion,
            auth: {
                creds: newState.creds,
                keys: makeCacheableSignalKeyStore(newState.keys, logger),
            },
            logger,
            browser: ['Whtsp', 'Chrome', '4.0.0'],
            markOnlineOnConnect: false,
            syncFullHistory: false,
        });
        // Re-attach anti-ban (we need to update internal sock reference)
        // For simplicity, we rely on event hooks
        newSock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut) {
                    await reconnect();
                }
            }
            if (connection === 'open') {
                eventEmitter.emit('connection.update', { connection: 'open' });
            }
        });
        newSock.ev.on('creds.update', newSaveCreds);
        newSock.ev.on('messages.upsert', (msg) => {
            eventEmitter.emit('messages.upsert', { messages: msg.messages, type: msg.type });
        });
        // Update socket reference (internal)
        Object.assign(sock, newSock);
    }
    // ─── Helper: wait for delay ────────────────────────────────────────
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // ─── Client API ────────────────────────────────────────────────────
    const client = {
        get socket() { return sock; },
        antiBan: {
            getState: () => antiban.getState(),
            pause: (reason) => antiban.pause(reason),
            resume: () => antiban.resume(),
            reset: () => antiban.reset(),
        },
        async sendText(to, text, options) {
            const decision = await antiban.beforeSend(to, text);
            if (!decision.allowed) {
                throw new Error(`Blocked: ${decision.reason}`);
            }
            await sleep(decision.delayMs);
            const msg = await sock.sendMessage(to, { text }, { quoted: options?.quoted });
            antiban.afterSend(to);
            return msg;
        },
        async sendImage(to, image, caption) {
            const decision = await antiban.beforeSend(to);
            if (!decision.allowed) {
                throw new Error(`Blocked: ${decision.reason}`);
            }
            await sleep(decision.delayMs);
            const content = typeof image === 'string'
                ? { image: { url: image }, caption }
                : { image, caption };
            const msg = await sock.sendMessage(to, content);
            antiban.afterSend(to);
            return msg;
        },
        async sendVideo(to, video, caption) {
            const decision = await antiban.beforeSend(to);
            if (!decision.allowed) {
                throw new Error(`Blocked: ${decision.reason}`);
            }
            await sleep(decision.delayMs);
            const content = typeof video === 'string'
                ? { video: { url: video }, caption }
                : { video, caption };
            const msg = await sock.sendMessage(to, content);
            antiban.afterSend(to);
            return msg;
        },
        async sendAudio(to, audio, ptt = false) {
            const decision = await antiban.beforeSend(to);
            if (!decision.allowed) {
                throw new Error(`Blocked: ${decision.reason}`);
            }
            await sleep(decision.delayMs);
            const content = typeof audio === 'string'
                ? { audio: { url: audio }, ptt }
                : { audio, ptt };
            const msg = await sock.sendMessage(to, content);
            antiban.afterSend(to);
            return msg;
        },
        async sendDocument(to, doc, fileName, mimetype = 'application/pdf') {
            const decision = await antiban.beforeSend(to);
            if (!decision.allowed) {
                throw new Error(`Blocked: ${decision.reason}`);
            }
            await sleep(decision.delayMs);
            const content = typeof doc === 'string'
                ? { document: { url: doc }, fileName, mimetype }
                : { document: doc, fileName, mimetype };
            const msg = await sock.sendMessage(to, content);
            antiban.afterSend(to);
            return msg;
        },
        async react(to, emoji, key) {
            await sock.sendMessage(to, { react: { text: emoji, key } });
        },
        async readMessages(keys) {
            await sock.readMessages(keys);
        },
        async sendPresence(presence, to) {
            await sock.sendPresenceUpdate(presence, to);
        },
        async getContact(jid) {
            // In v7, contacts are managed via events, not store
            // Return undefined for now - users should listen to contacts.upsert events
            return undefined;
        },
        async getGroupMetadata(jid) {
            return sock.groupMetadata(jid);
        },
        async getChats() {
            // In v7, chats are managed via events, not store
            // Return empty array for now - users should listen to chats.upsert events
            return [];
        },
        async isOnWhatsApp(phone) {
            const clean = phone.replace(/[^0-9]/g, '');
            const result = await sock.onWhatsApp(clean);
            return result ?? [];
        },
        async disconnect() {
            antiban.destroy();
            sock.end(undefined);
        },
        on(event, handler) {
            eventEmitter.on(event, handler);
        },
        off(event, handler) {
            eventEmitter.off(event, handler);
        },
    };
    return client;
}
function buildConfig(partial) {
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
    };
}
//# sourceMappingURL=wa-socket.js.map