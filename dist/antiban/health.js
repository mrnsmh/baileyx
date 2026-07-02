const RISK_ORDER = ['low', 'medium', 'high', 'critical'];
export class HealthMonitor {
    status;
    config;
    disconnectTimestamps = [];
    failedMessageTimestamps = [];
    forbiddenCount = 0;
    startTime;
    constructor(config = {}) {
        this.config = {
            autoPauseAt: config.autoPauseAt ?? 'high',
            maxDisconnectsPerHour: config.maxDisconnectsPerHour ?? 5,
            maxFailedMessagesPerHour: config.maxFailedMessagesPerHour ?? 10,
            maxForbiddenErrors: config.maxForbiddenErrors ?? 3,
        };
        this.startTime = Date.now();
        this.status = {
            risk: 'low',
            score: 0,
            reasons: [],
            uptime: 0,
            failedMessages: 0,
            successfulMessages: 0,
        };
    }
    cleanupOldEntries() {
        const oneHourAgo = Date.now() - 3_600_000;
        this.disconnectTimestamps = this.disconnectTimestamps.filter(t => t > oneHourAgo);
        this.failedMessageTimestamps = this.failedMessageTimestamps.filter(t => t > oneHourAgo);
    }
    computeRisk() {
        this.cleanupOldEntries();
        let score = 0;
        const reasons = [];
        // Disconnect frequency
        if (this.disconnectTimestamps.length > this.config.maxDisconnectsPerHour) {
            score += 30;
            reasons.push(`${this.disconnectTimestamps.length} disconnects in last hour`);
        }
        // Failed messages
        if (this.failedMessageTimestamps.length > this.config.maxFailedMessagesPerHour) {
            score += 25;
            reasons.push(`${this.failedMessageTimestamps.length} failed messages in last hour`);
        }
        // Forbidden errors (403)
        if (this.forbiddenCount > 0) {
            score += this.forbiddenCount * 15;
            reasons.push(`${this.forbiddenCount} forbidden (403) errors`);
        }
        // Delivery rate
        const total = this.status.successfulMessages + this.status.failedMessages;
        if (total > 10) {
            const failureRate = this.status.failedMessages / total;
            if (failureRate > 0.3) {
                score += 20;
                reasons.push(`high failure rate: ${(failureRate * 100).toFixed(1)}%`);
            }
        }
        // Determine risk level
        let risk;
        if (score >= 70)
            risk = 'critical';
        else if (score >= 40)
            risk = 'high';
        else if (score >= 15)
            risk = 'medium';
        else
            risk = 'low';
        this.status = {
            risk,
            score: Math.min(100, score),
            reasons,
            uptime: Date.now() - this.startTime,
            failedMessages: this.status.failedMessages,
            successfulMessages: this.status.successfulMessages,
        };
        return risk;
    }
    onDisconnect(reason) {
        this.disconnectTimestamps.push(Date.now());
        this.status.lastDisconnect = reason ?? 'unknown';
        this.computeRisk();
    }
    onMessageFailed() {
        this.failedMessageTimestamps.push(Date.now());
        this.status.failedMessages++;
        this.computeRisk();
    }
    onMessageSuccess() {
        this.status.successfulMessages++;
        // Gradually reduce score on success
        if (this.status.score > 0) {
            this.status.score = Math.max(0, this.status.score - 1);
        }
    }
    onForbidden() {
        this.forbiddenCount++;
        this.computeRisk();
    }
    shouldAutoPause() {
        const riskOrder = RISK_ORDER;
        const currentIdx = riskOrder.indexOf(this.status.risk);
        const pauseIdx = riskOrder.indexOf(this.config.autoPauseAt);
        return currentIdx >= pauseIdx;
    }
    getStatus() {
        this.computeRisk();
        return { ...this.status };
    }
    reset() {
        this.disconnectTimestamps = [];
        this.failedMessageTimestamps = [];
        this.forbiddenCount = 0;
        this.startTime = Date.now();
        this.status = {
            risk: 'low',
            score: 0,
            reasons: [],
            uptime: 0,
            failedMessages: 0,
            successfulMessages: 0,
        };
    }
}
//# sourceMappingURL=health.js.map