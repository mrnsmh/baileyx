import type { WhtspConfig, AntiBanState } from '../core/types.js';
export declare class ConfigManager {
    private configPath;
    private statePath;
    private config;
    constructor(dataDir: string);
    private defaults;
    load(): Promise<WhtspConfig>;
    save(): Promise<void>;
    get(): WhtspConfig;
    update(patch: Partial<WhtspConfig>): Promise<WhtspConfig>;
    loadState(): Promise<AntiBanState | null>;
    saveState(state: AntiBanState): Promise<void>;
    clearState(): Promise<void>;
}
/**
 * Quick helper to load config from a directory.
 */
export declare function loadConfig(dataDir: string): Promise<WhtspConfig>;
/**
 * Quick helper to save config to a directory.
 */
export declare function saveConfig(dataDir: string, config: Partial<WhtspConfig>): Promise<WhtspConfig>;
//# sourceMappingURL=manager.d.ts.map