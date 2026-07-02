import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
const CONFIG_FILE = 'whtsp.config.json';
const STATE_FILE = 'whtsp.state.json';
export class ConfigManager {
    configPath;
    statePath;
    config;
    constructor(dataDir) {
        this.configPath = join(dataDir, CONFIG_FILE);
        this.statePath = join(dataDir, STATE_FILE);
        this.config = this.defaults();
    }
    defaults() {
        return {
            authDir: './auth',
            sessionId: 'default',
            preset: 'balanced',
            maxPerMinute: 10,
            maxPerHour: 100,
            maxPerDay: 500,
            minDelayMs: 1200,
            maxDelayMs: 5400,
            warmupDays: 7,
            warmupDay1Limit: 20,
            warmupGrowthFactor: 1.8,
            autoPauseAt: 'high',
            typingIndicators: true,
            readReceipts: true,
            presenceUpdates: true,
            logLevel: 'info',
            api: {
                enabled: false,
                port: 3010,
                host: '0.0.0.0',
            },
            mcp: {
                enabled: false,
                transport: 'stdio',
                port: 3011,
            },
            webhooks: {},
        };
    }
    async load() {
        if (existsSync(this.configPath)) {
            const raw = await readFile(this.configPath, 'utf-8');
            const parsed = JSON.parse(raw);
            this.config = { ...this.defaults(), ...parsed };
        }
        else {
            this.config = this.defaults();
            await this.save();
        }
        return this.config;
    }
    async save() {
        await mkdir(dirname(this.configPath), { recursive: true });
        await writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    }
    get() {
        return this.config;
    }
    async update(patch) {
        this.config = { ...this.config, ...patch };
        await this.save();
        return this.config;
    }
    // ─── State persistence ─────────────────────────────────────────────
    async loadState() {
        if (existsSync(this.statePath)) {
            const raw = await readFile(this.statePath, 'utf-8');
            return JSON.parse(raw);
        }
        return null;
    }
    async saveState(state) {
        await mkdir(dirname(this.statePath), { recursive: true });
        await writeFile(this.statePath, JSON.stringify(state, null, 2));
    }
    async clearState() {
        if (existsSync(this.statePath)) {
            const { unlink } = await import('fs/promises');
            await unlink(this.statePath);
        }
    }
}
/**
 * Quick helper to load config from a directory.
 */
export async function loadConfig(dataDir) {
    const mgr = new ConfigManager(dataDir);
    return mgr.load();
}
/**
 * Quick helper to save config to a directory.
 */
export async function saveConfig(dataDir, config) {
    const mgr = new ConfigManager(dataDir);
    await mgr.load();
    return mgr.update(config);
}
//# sourceMappingURL=manager.js.map