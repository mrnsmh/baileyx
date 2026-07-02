import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import type { WhtspConfig, AntiBanState } from '../core/types.js'

const CONFIG_FILE = 'whtsp.config.json'
const STATE_FILE = 'whtsp.state.json'

export class ConfigManager {
  private configPath: string
  private statePath: string
  private config: WhtspConfig

  constructor(dataDir: string) {
    this.configPath = join(dataDir, CONFIG_FILE)
    this.statePath = join(dataDir, STATE_FILE)
    this.config = this.defaults()
  }

  private defaults(): WhtspConfig {
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
    }
  }

  async load(): Promise<WhtspConfig> {
    if (existsSync(this.configPath)) {
      const raw = await readFile(this.configPath, 'utf-8')
      const parsed = JSON.parse(raw)
      this.config = deepMerge(this.defaults(), parsed)
    } else {
      this.config = this.defaults()
      await this.save()
    }
    return this.config
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.configPath), { recursive: true })
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2))
  }

  get(): WhtspConfig {
    return this.config
  }

  async update(patch: Partial<WhtspConfig>): Promise<WhtspConfig> {
    this.config = deepMerge(this.config, patch)
    await this.save()
    return this.config
  }

  // ─── State persistence ─────────────────────────────────────────────
  async loadState(): Promise<AntiBanState | null> {
    if (existsSync(this.statePath)) {
      const raw = await readFile(this.statePath, 'utf-8')
      return JSON.parse(raw) as AntiBanState
    }
    return null
  }

  async saveState(state: AntiBanState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true })
    await writeFile(this.statePath, JSON.stringify(state, null, 2))
  }

  async clearState(): Promise<void> {
    if (existsSync(this.statePath)) {
      const { unlink } = await import('fs/promises')
      await unlink(this.statePath)
    }
  }
}

/**
 * Quick helper to load config from a directory.
 */
export async function loadConfig(dataDir: string): Promise<WhtspConfig> {
  const mgr = new ConfigManager(dataDir)
  return mgr.load()
}

/**
 * Quick helper to save config to a directory.
 */
export async function saveConfig(dataDir: string, config: Partial<WhtspConfig>): Promise<WhtspConfig> {
  const mgr = new ConfigManager(dataDir)
  await mgr.load()
  return mgr.update(config)
}

/**
 * Deep merge two objects. Target values are overwritten by source.
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target }
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key]
    const targetVal = target[key]
    if (
      sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
      targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)
    ) {
      ;(result as any)[key] = deepMerge(targetVal, sourceVal as any)
    } else if (sourceVal !== undefined) {
      ;(result as any)[key] = sourceVal
    }
  }
  return result
}
