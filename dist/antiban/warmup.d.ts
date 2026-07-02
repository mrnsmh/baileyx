import type { WarmUpState } from '../core/types.js';
export declare class WarmUp {
    private state;
    private config;
    constructor(config?: {
        days?: number;
        day1Limit?: number;
        growthFactor?: number;
        inactivityThresholdHours?: number;
    });
    private initState;
    /**
     * Get the message limit for the current warmup day.
     */
    getDayLimit(): number;
    /**
     * Check if we can send based on warmup limits.
     */
    canSend(): {
        allowed: boolean;
        limit: number;
        sent: number;
        day: number;
        reason?: string;
    };
    record(): void;
    advanceDay(): void;
    getState(): WarmUpState;
    importState(state: WarmUpState): void;
    isComplete(): boolean;
    getProgress(): {
        day: number;
        maxDays: number;
        sent: number;
        limit: number;
        percent: number;
    };
}
//# sourceMappingURL=warmup.d.ts.map