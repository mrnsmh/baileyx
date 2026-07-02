import type { WASocket } from 'baileys';
import type { AntiBanState, HealthStatus, BanRiskLevel } from '../core/types.js';
export interface AntiBanConfig {
    preset?: 'minimal' | 'balanced' | 'maximum';
    maxPerMinute?: number;
    maxPerHour?: number;
    maxPerDay?: number;
    minDelayMs?: number;
    maxDelayMs?: number;
    warmupDays?: number;
    warmupDay1Limit?: number;
    warmupGrowthFactor?: number;
    autoPauseAt?: BanRiskLevel;
    typingIndicators?: boolean;
    readReceipts?: boolean;
    presenceUpdates?: boolean;
}
export declare class AntiBan {
    private rateLimiter;
    private warmUp;
    private healthMonitor;
    private presence?;
    private paused;
    private pauseReason?;
    private messageStats;
    private sock?;
    private config;
    constructor(config?: AntiBanConfig);
    /**
     * Attach to a Baileys socket (enables presence simulation).
     */
    attach(sock: WASocket): void;
    /**
     * Check if a message can be sent. Returns decision with delay.
     */
    beforeSend(jid: string, content?: string): Promise<{
        allowed: boolean;
        delayMs: number;
        reason?: string;
        health: HealthStatus;
        warmupDay: number;
    }>;
    /**
     * Record a successful send.
     */
    afterSend(jid: string): void;
    /**
     * Record a failed send.
     */
    afterSendFailed(): void;
    /**
     * Record a forbidden error.
     */
    onForbidden(): void;
    getState(): AntiBanState;
    pause(reason?: string): void;
    resume(): void;
    reset(): void;
    isPaused(): boolean;
    exportState(): AntiBanState;
    importState(state: AntiBanState): void;
    destroy(): void;
}
//# sourceMappingURL=index.d.ts.map