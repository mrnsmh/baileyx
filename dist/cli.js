#!/usr/bin/env node
import { createWhtspClient } from './core/wa-socket.js';
import { ApiServer } from './api/server.js';
import { McpServer } from './mcp/server.js';
import { ConfigManager } from './config/manager.js';
const args = process.argv.slice(2);
function printHelp() {
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
`);
}
function printVersion() {
    console.log('whtsp v0.1.0');
}
function parseArgs(args) {
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            parsed.help = true;
        }
        else if (arg === '--version' || arg === '-v') {
            parsed.version = true;
        }
        else if (arg === '--api') {
            parsed.api = true;
        }
        else if (arg === '--mcp') {
            parsed.mcp = true;
        }
        else if (arg === '--status') {
            parsed.status = true;
        }
        else if (arg === '--port' && args[i + 1]) {
            parsed.port = args[++i];
        }
        else if (arg === '--mcp-port' && args[i + 1]) {
            parsed.mcpPort = args[++i];
        }
        else if (arg === '--session' && args[i + 1]) {
            parsed.session = args[++i];
        }
        else if (arg === '--preset' && args[i + 1]) {
            parsed.preset = args[++i];
        }
        else if (arg === '--config' && args[i + 1]) {
            parsed.config = args[++i];
        }
    }
    return parsed;
}
async function main() {
    const opts = parseArgs(args);
    if (opts.help) {
        printHelp();
        process.exit(0);
    }
    if (opts.version) {
        printVersion();
        process.exit(0);
    }
    const configDir = opts.config ?? './whtsp-data';
    const configMgr = new ConfigManager(configDir);
    const savedConfig = await configMgr.load();
    // Merge CLI args into config
    const config = {
        ...savedConfig,
        sessionId: opts.session ?? savedConfig.sessionId,
        preset: opts.preset ?? savedConfig.preset,
        api: {
            ...savedConfig.api,
            enabled: Boolean(opts.api),
            port: Number(opts.port) ?? savedConfig.api.port,
        },
        mcp: {
            ...savedConfig.mcp,
            enabled: Boolean(opts.mcp),
            port: Number(opts.mcpPort) ?? savedConfig.mcp.port,
        },
    };
    console.log('[whtsp] Starting...');
    console.log(`[whtsp] Session: ${config.sessionId}`);
    console.log(`[whtsp] Preset: ${config.preset}`);
    // Create client
    const client = await createWhtspClient({ config });
    // Show QR code in terminal
    client.on('connection.update', (event) => {
        if (event.qr) {
            console.log('\n[whtsp] Scan this QR code with WhatsApp:\n');
            // Simple QR display (in real use, use qrcode-terminal)
            console.log(event.qr);
            console.log();
        }
        if (event.connection === 'open') {
            console.log('[whtsp] Connected!');
        }
        if (event.connection === 'close') {
            console.log('[whtsp] Disconnected. Reconnecting...');
        }
    });
    // Handle messages
    client.on('messages.upsert', (event) => {
        for (const msg of event.messages) {
            if (!msg.key.fromMe && event.type === 'notify') {
                const from = msg.key.remoteJid;
                const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? '';
                console.log(`[whtsp] Message from ${from}: ${text}`);
            }
        }
    });
    // Start API if requested
    let apiServer;
    if (opts.api) {
        apiServer = new ApiServer(client, {
            port: Number(opts.port) ?? config.api?.port ?? 3010,
            host: config.api?.host ?? '0.0.0.0',
            apiKey: config.api?.apiKey,
        });
        await apiServer.start();
        console.log(`[whtsp] API server listening on port ${config.api?.port ?? 3010}`);
    }
    // Start MCP if requested
    let mcpServer;
    if (opts.mcp) {
        mcpServer = new McpServer(client, {
            transport: 'stdio',
        });
        console.log('[whtsp] MCP server started (stdio)');
        mcpServer.start();
    }
    // If neither API nor MCP, just run interactively
    if (!opts.api && !opts.mcp) {
        console.log('[whtsp] Running in interactive mode. Press Ctrl+C to exit.');
    }
    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n[whtsp] Shutting down...');
        if (apiServer)
            await apiServer.stop();
        await client.disconnect();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        if (apiServer)
            await apiServer.stop();
        await client.disconnect();
        process.exit(0);
    });
}
main().catch((err) => {
    console.error('[whtsp] Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map