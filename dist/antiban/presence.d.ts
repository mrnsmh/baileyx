import type { WASocket } from 'baileys';
export interface PresenceConfig {
    typingProbability: number;
    composingDurationMs: [number, number];
    pauseBetweenTypingMs: [number, number];
    readReceiptDelayMs: [number, number];
    offlineGapMs: [number, number];
}
export declare class PresenceSimulator {
    private sock;
    private config;
    private isOnline;
    private typingTimeout?;
    constructor(sock: WASocket, config?: Partial<PresenceConfig>);
    private rand;
    /**
     * Simulate typing before sending a message.
     * Returns a promise that resolves when "typing" is done.
     */
    simulateTyping(jid: string): Promise<void>;
    /**
     * Simulate reading a message after receiving it.
     */
    simulateRead(jid: string): Promise<void>;
    /**
     * Mark as available (online).
     */
    goOnline(): Promise<void>;
    /**
     * Mark as unavailable (offline).
     */
    goOffline(): Promise<void>;
    /**
     * Start periodic presence cycling (online/offline gaps).
     */
    startPresenceCycling(intervalMs?: number): void;
    stopPresenceCycling(): void;
    /**
     * Simulate a full send flow: type -> wait -> send (caller handles actual send).
     */
    preSend(jid: string): Promise<void>;
    /**
     * Post-send: pause typing indicator.
     */
    postSend(jid: string): Promise<void>;
}
//# sourceMappingURL=presence.d.ts.map