const DEFAULT_PRESENCE_CONFIG = {
    typingProbability: 0.7,
    composingDurationMs: [1500, 4000],
    pauseBetweenTypingMs: [500, 2000],
    readReceiptDelayMs: [2000, 8000],
    offlineGapMs: [30_000, 120_000],
};
export class PresenceSimulator {
    sock;
    config;
    isOnline = false;
    typingTimeout;
    constructor(sock, config = {}) {
        this.sock = sock;
        this.config = { ...DEFAULT_PRESENCE_CONFIG, ...config };
    }
    rand(min, max) {
        return Math.round(min + Math.random() * (max - min));
    }
    /**
     * Simulate typing before sending a message.
     * Returns a promise that resolves when "typing" is done.
     */
    async simulateTyping(jid) {
        if (Math.random() > this.config.typingProbability)
            return;
        try {
            await this.sock.sendPresenceUpdate('composing', jid);
            const duration = this.rand(...this.config.composingDurationMs);
            await new Promise(resolve => setTimeout(resolve, duration));
            await this.sock.sendPresenceUpdate('paused', jid);
        }
        catch {
            // Presence errors are non-fatal
        }
    }
    /**
     * Simulate reading a message after receiving it.
     */
    async simulateRead(jid) {
        const delay = this.rand(...this.config.readReceiptDelayMs);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    /**
     * Mark as available (online).
     */
    async goOnline() {
        if (this.isOnline)
            return;
        try {
            await this.sock.sendPresenceUpdate('available');
            this.isOnline = true;
        }
        catch {
            // Non-fatal
        }
    }
    /**
     * Mark as unavailable (offline).
     */
    async goOffline() {
        if (!this.isOnline)
            return;
        try {
            await this.sock.sendPresenceUpdate('unavailable');
            this.isOnline = false;
        }
        catch {
            // Non-fatal
        }
    }
    /**
     * Start periodic presence cycling (online/offline gaps).
     */
    startPresenceCycling(intervalMs) {
        const gap = intervalMs ?? this.rand(...this.config.offlineGapMs);
        this.typingTimeout = setTimeout(async () => {
            if (this.isOnline) {
                await this.goOffline();
                // Stay offline for a bit
                const offlineGap = this.rand(30_000, 60_000);
                setTimeout(() => this.startPresenceCycling(), offlineGap);
            }
            else {
                await this.goOnline();
                this.startPresenceCycling();
            }
        }, gap);
    }
    stopPresenceCycling() {
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = undefined;
        }
    }
    /**
     * Simulate a full send flow: type -> wait -> send (caller handles actual send).
     */
    async preSend(jid) {
        await this.goOnline();
        await this.simulateTyping(jid);
    }
    /**
     * Post-send: pause typing indicator.
     */
    async postSend(jid) {
        try {
            await this.sock.sendPresenceUpdate('paused', jid);
        }
        catch {
            // Non-fatal
        }
    }
}
//# sourceMappingURL=presence.js.map