export class WarmUp {
    state;
    config;
    constructor(config = {}) {
        this.config = {
            days: config.days ?? 7,
            day1Limit: config.day1Limit ?? 20,
            growthFactor: config.growthFactor ?? 1.8,
            inactivityThresholdHours: config.inactivityThresholdHours ?? 48,
        };
        this.state = this.initState();
    }
    initState() {
        return {
            day: 1,
            startDate: new Date().toISOString(),
            totalSent: 0,
        };
    }
    /**
     * Get the message limit for the current warmup day.
     */
    getDayLimit() {
        return Math.round(this.config.day1Limit * Math.pow(this.config.growthFactor, this.state.day - 1));
    }
    /**
     * Check if we can send based on warmup limits.
     */
    canSend() {
        // Check inactivity reset
        if (this.state.lastSentAt) {
            const lastSent = new Date(this.state.lastSentAt);
            const hoursSince = (Date.now() - lastSent.getTime()) / 3_600_000;
            if (hoursSince > this.config.inactivityThresholdHours) {
                // Reset warmup
                this.state = this.initState();
            }
        }
        const limit = this.getDayLimit();
        // Check if we've completed warmup
        if (this.state.day > this.config.days) {
            return { allowed: true, limit: Infinity, sent: this.state.totalSent, day: this.state.day };
        }
        if (this.state.totalSent >= limit) {
            return {
                allowed: false,
                limit,
                sent: this.state.totalSent,
                day: this.state.day,
                reason: `warmup day ${this.state.day}/${this.config.days}: ${this.state.totalSent}/${limit} messages sent`,
            };
        }
        return { allowed: true, limit, sent: this.state.totalSent, day: this.state.day };
    }
    record() {
        this.state.totalSent++;
        this.state.lastSentAt = new Date().toISOString();
    }
    advanceDay() {
        this.state.day++;
        this.state.totalSent = 0;
    }
    getState() {
        return { ...this.state };
    }
    importState(state) {
        this.state = { ...state };
    }
    isComplete() {
        return this.state.day > this.config.days;
    }
    getProgress() {
        const limit = this.getDayLimit();
        return {
            day: this.state.day,
            maxDays: this.config.days,
            sent: this.state.totalSent,
            limit,
            percent: Math.min(100, Math.round((this.state.day / this.config.days) * 100)),
        };
    }
}
//# sourceMappingURL=warmup.js.map