#!/usr/bin/env node

import { createWhtspClient } from './core/wa-socket.js'
import { ApiServer } from './api/server.js'
import { McpServer } from './mcp/server.js'
import { ConfigManager } from './config/manager.js'
import type { WhtspConfig } from './core/types.js'

const args = process.argv.slice(2)

function printHelp(): void {
  console.log(`
whtsp - Reinforced WhatsApp Client

Usage:
  whtsp [options]

Options:
  --api           Start REST API server
  --mcp           Start MCP server
  --port <port>   API server port (default: 3010)
  --mcp-port <p>  MCP server port (default: 3011)
  --session <id>  Session name (default: default)
  --preset <p>    Anti-ban preset: minimal | balanced | maximum (default: balanced)
  --config <dir>  Config directory (default: ./whtsp-data)
  --status        Show status and exit
  --help          Show this help
  --version       Show version

Examples:
  whtsp                              # Start interactive session (QR code)
  whtsp --api                        # Start with REST API
  whtsp --mcp                        # Start with MCP server
  whtsp --api --mcp                  # Start both API and MCP
  whtsp --api --port 3020            # API on custom port
  whtsp --preset maximum             # Maximum anti-ban protection
`)
}

function printVersion(): void {
  console.log('whtsp v0.1.0')
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--help' || arg === '-h') {
      parsed.help = true
    } else if (arg === '--version' || arg === '-v') {
      parsed.version = true
    } else if (arg === '--api') {
      parsed.api = true
    } else if (arg === '--mcp') {
      parsed.mcp = true
    } else if (arg === '--status') {
      parsed.status = true
    } else if (arg === '--port') {
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        parsed.port = next
        i++
      } else {
        console.error('[whtsp] Error: --port requires a value')
        process.exit(1)
      }
    } else if (arg === '--mcp-port') {
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        parsed.mcpPort = next
        i++
      } else {
        console.error('[whtsp] Error: --mcp-port requires a value')
        process.exit(1)
      }
    } else if (arg === '--session') {
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        parsed.session = next
        i++
      } else {
        console.error('[whtsp] Error: --session requires a value')
        process.exit(1)
      }
    } else if (arg === '--preset') {
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        parsed.preset = next
        i++
      } else {
        console.error('[whtsp] Error: --preset requires a value')
        process.exit(1)
      }
    } else if (arg === '--config') {
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        parsed.config = next
        i++
      } else {
        console.error('[whtsp] Error: --config requires a value')
        process.exit(1)
      }
    }
  }
  return parsed
}

function safeNumber(val: string | boolean | undefined, fallback: number): number {
  if (typeof val !== 'string') return fallback
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

async function main(): Promise<void> {
  const opts = parseArgs(args)

  if (opts.help) {
    printHelp()
    process.exit(0)
  }

  if (opts.version) {
    printVersion()
    process.exit(0)
  }

  const configDir = (opts.config as string) ?? './whtsp-data'
  const configMgr = new ConfigManager(configDir)
  const savedConfig = await configMgr.load()

  // Merge CLI args into config (deep merge for nested objects)
  const config: Partial<WhtspConfig> = {
    ...savedConfig,
    sessionId: (opts.session as string) ?? savedConfig.sessionId,
    preset: (opts.preset as 'minimal' | 'balanced' | 'maximum') ?? savedConfig.preset,
    api: {
      ...savedConfig.api,
      enabled: Boolean(opts.api),
      port: safeNumber(opts.port, savedConfig.api.port),
    },
    mcp: {
      ...savedConfig.mcp,
      enabled: Boolean(opts.mcp),
      port: safeNumber(opts.mcpPort, savedConfig.mcp.port),
    },
  }

  console.log('[whtsp] Starting...')
  console.log(`[whtsp] Session: ${config.sessionId}`)
  console.log(`[whtsp] Preset: ${config.preset}`)

  // Create client
  const client = await createWhtspClient({ config })

  // Show QR code in terminal
  client.on('connection.update', (event: any) => {
    if (event.qr) {
      console.log('\n[whtsp] Scan this QR code with WhatsApp:\n')
      console.log(event.qr)
      console.log()
    }
    if (event.connection === 'open') {
      console.log('[whtsp] Connected!')
    }
    if (event.connection === 'close') {
      console.log('[whtsp] Disconnected. Reconnecting...')
    }
  })

  // Handle messages
  client.on('messages.upsert', (event: any) => {
    for (const msg of event.messages) {
      if (!msg.key.fromMe && event.type === 'notify') {
        const from = msg.key.remoteJid
        const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? ''
        console.log(`[whtsp] Message from ${from}: ${text}`)
      }
    }
  })

  // Start API if requested
  let apiServer: ApiServer | undefined
  if (opts.api) {
    apiServer = new ApiServer(client, {
      port: safeNumber(opts.port, config.api?.port ?? 3010),
      host: config.api?.host ?? '0.0.0.0',
      apiKey: config.api?.apiKey,
    })
    await apiServer.start()
    console.log(`[whtsp] API server listening on port ${config.api?.port ?? 3010}`)
  }

  // Start MCP if requested
  let mcpServer: McpServer | undefined
  if (opts.mcp) {
    mcpServer = new McpServer(client, {
      transport: 'stdio',
    })
    console.log('[whtsp] MCP server starting (stdio)...')
    await mcpServer.start()
  }

  // If neither API nor MCP, just run interactively
  if (!opts.api && !opts.mcp) {
    console.log('[whtsp] Running in interactive mode. Press Ctrl+C to exit.')
  }

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log('\n[whtsp] Shutting down...')
    try {
      if (apiServer) await apiServer.stop()
    } catch {
      // Non-fatal
    }
    try {
      await client.disconnect()
    } catch {
      // Non-fatal
    }
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[whtsp] Fatal error:', err)
  process.exit(1)
})
