import type { RateLimitState } from '../core/types.js';
export declare class RateLimiter {
    private state;
    private limits;
    constructor(config: {
        perMinute: number;
        perHour: number;
        perDay: number;
        minDelayMs: number;
        maxDelayMs: number;
    });
    private initState;
    private resetIfNeeded;
    /**
     * Check if we can send and compute delay with Gaussian jitter.
     * Returns { allowed, delayMs, reason? }
     */
    canSend(): {
        allowed: boolean;
        delayMs: number;
        reason?: string;
    };
    record(): void;
    getState(): RateLimitState;
    /**
     * Gaussian-distributed random delay between minDelay and maxDelay.
     * Uses Box-Muller transform for natural distribution.
     */
    private gaussianDelay;
    /**
     * Scale limits by a factor (for warmup or adaptive throttling).
     */
    scaleLimits(factor: number): void;
    reset(): void;
}
//# sourceMappingURL=rate-limiter.d.ts.map