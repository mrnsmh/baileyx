import type { HealthStatus, BanRiskLevel } from '../core/types.js';
interface HealthConfig {
    autoPauseAt: BanRiskLevel;
    maxDisconnectsPerHour: number;
    maxFailedMessagesPerHour: number;
    maxForbiddenErrors: number;
}
export declare class HealthMonitor {
    private status;
    private config;
    private disconnectTimestamps;
    private failedMessageTimestamps;
    private forbiddenCount;
    private startTime;
    constructor(config?: Partial<HealthConfig>);
    private cleanupOldEntries;
    private computeRisk;
    onDisconnect(reason?: string): void;
    onMessageFailed(): void;
    onMessageSuccess(): void;
    onForbidden(): void;
    shouldAutoPause(): boolean;
    getStatus(): HealthStatus;
    reset(): void;
}
export {};
//# sourceMappingURL=health.d.ts.map