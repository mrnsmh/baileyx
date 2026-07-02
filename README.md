# baileyx

> Reinforced Baileys v7 wrapper with anti-ban engine, REST API, MCP server, and JSON config.

A production-ready WhatsApp client library that wraps [Baileys](https://github.com/WhiskeySockets/Baileys) with intelligent rate limiting, warmup sequences, health monitoring, and presence simulation. Exposes everything via CLI, REST API, or MCP protocol for AI agent integration.

---

## Features

- **Baileys v7** — Latest version with ESM support and zero-day fixes
- **Anti-ban engine** — Gaussian jitter rate limiter, 7-day warmup, health monitoring, presence simulation
- **REST API** — Full HTTP interface with optional API key auth
- **MCP server** — 11 tools for AI agent integration (stdio + HTTP transport)
- **JSON config** — Persistent config and state with deep merge
- **Auto-reconnect** — Exponential backoff with max 10 retries, no socket corruption
- **3 presets** — `minimal`, `balanced`, `maximum` for different risk tolerances

---

## Install

```bash
git clone https://github.com/mrnsmh/baileyx.git
cd baileyx
npm install
npm run build
```

---

## Quick Start

```bash
# Interactive mode (QR code scan)
npm start

# With REST API
npm run start:api

# With MCP server (for AI agents)
npm run start:mcp

# Both API + MCP
node dist/cli.js --api --mcp
```

---

## CLI

```
whtsp [options]

Options:
  --api           Start REST API server
  --mcp           Start MCP server (stdio)
  --port <port>   API port (default: 3010)
  --mcp-port <p>  MCP port (default: 3011)
  --session <id>  Session name (default: default)
  --preset <p>    Anti-ban preset: minimal | balanced | maximum
  --config <dir>  Config directory (default: ./whtsp-data)
  --status        Show status and exit
  --help          Show help
  --version       Show version
```

### Examples

```bash
whtsp                              # Interactive session
whtsp --api                        # With REST API
whtsp --mcp                        # With MCP server
whtsp --api --mcp                  # Both
whtsp --api --port 3020            # Custom API port
whtsp --preset maximum             # Maximum anti-ban protection
whtsp --session prod --config /data  # Named session, custom config dir
```

---

## Anti-Ban Engine

### Presets

| Preset | Msg/Min | Msg/Hour | Msg/Day | Delay Range | Warmup |
|--------|---------|----------|---------|-------------|--------|
| `minimal` | 5 | 50 | 200 | 2–8s | 3 days |
| `balanced` | 10 | 100 | 500 | 1.2–5.4s | 7 days |
| `maximum` | 3 | 30 | 100 | 3–12s | 14 days |

### Components

**Rate Limiter** — Gaussian jitter using Box-Muller transform. Delays follow a bell curve around the midpoint instead of uniform random, producing more human-like timing patterns.

**Warmup** — Day 1 starts at 20 messages, grows by 1.8x per day. Auto-advances when daily limit is reached. Resets after 48h inactivity.

**Health Monitor** — Tracks disconnects, failed messages, forbidden errors (403), and failure rate. Risk score 0–100 with auto-pause at configurable threshold (`low`/`medium`/`high`/`critical`). Successful messages decay the risk score.

**Presence Simulator** — Configurable typing probability (70%), composing duration (1.5–4s), read receipt delays (2–8s), and offline gaps (30–120s).

### Risk Scoring

| Factor | Score Impact |
|--------|-------------|
| >5 disconnects/hour | +30 |
| >10 failed messages/hour | +25 |
| Each forbidden (403) error | +15 |
| Failure rate >30% | +20 |
| Successful messages | -1 per 10 successes |

Auto-pause triggers when risk level reaches the configured threshold.

### Important

Anti-ban is **complementary, not a shield**. Meta detects Baileys at the protocol level ([#1925](https://github.com/WhiskeySockets/Baileys/issues/1925)). For proactive messaging (you initiate), use Cloud API. For reactive messaging (client initiates), Baileys is fine (<2% ban rate).

---

## Programmatic Usage

```typescript
import { createWhtspClient } from '@whtsp/core'

const client = await createWhtspClient({
  config: {
    preset: 'balanced',
    authDir: './auth',
    sessionId: 'default',
  }
})

// Connection events
client.on('connection.update', (event) => {
  if (event.qr) console.log('Scan QR:', event.qr)
  if (event.connection === 'open') console.log('Connected!')
  if (event.connection === 'close') console.log('Disconnected')
})

// Incoming messages
client.on('messages.upsert', (event) => {
  for (const msg of event.messages) {
    if (!msg.key.fromMe && event.type === 'notify') {
      const from = msg.key.remoteJid
      const text = msg.message?.conversation ?? ''
      console.log(`${from}: ${text}`)
    }
  }
})

// Send messages
await client.sendText('212600000000@s.whatsapp.net', 'Hello!')
await client.sendImage('212600000000@s.whatsapp.net', './photo.jpg', 'Caption')
await client.sendVideo('212600000000@s.whatsapp.net', './video.mp4')
await client.sendDocument('212600000000@s.whatsapp.net', './file.pdf', 'report.pdf')
await client.react('212600000000@s.whatsapp.net', '👍', messageKey)

// Anti-ban control
client.antiBan.pause('Maintenance')
client.antiBan.resume()
client.antiBan.reset()
console.log(client.antiBan.getState())

// Check if number exists
const [result] = await client.isOnWhatsApp('212600000000')
console.log(result.exists) // true/false

// Disconnect
await client.disconnect()
```

---

## REST API

Start with `--api`. All endpoints accept/return JSON.

### Authentication

If `apiKey` is configured, all endpoints (except `/health`) require one of:
- `X-Api-Key: <key>` header
- `?api_key=<key>` query parameter

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/status` | Connection + anti-ban status |
| `POST` | `/send` | Send text message |
| `POST` | `/send/image` | Send image |
| `POST` | `/send/video` | Send video |
| `POST` | `/send/document` | Send document |
| `POST` | `/react` | React to message |
| `GET` | `/check/:phone` | Check if number is on WhatsApp |
| `GET` | `/chats` | List chats |
| `POST` | `/antiban/pause` | Pause sending |
| `POST` | `/antiban/resume` | Resume sending |
| `POST` | `/antiban/reset` | Reset anti-ban state |
| `GET` | `/antiban/state` | Get full anti-ban state |

### Examples

**Send text:**
```bash
curl -X POST http://localhost:3010/send \
  -H "Content-Type: application/json" \
  -d '{"to": "212600000000@s.whatsapp.net", "text": "Hello!"}'
```

**Send image:**
```bash
curl -X POST http://localhost:3010/send/image \
  -H "Content-Type: application/json" \
  -d '{
    "to": "212600000000@s.whatsapp.net",
    "image": "https://example.com/photo.jpg",
    "caption": "Check this out"
  }'
```

**Check number:**
```bash
curl http://localhost:3010/check/212600000000
```

**Get status:**
```bash
curl http://localhost:3010/status
```

**Pause sending:**
```bash
curl -X POST http://localhost:3010/antiban/pause \
  -H "Content-Type: application/json" \
  -d '{"reason": "Maintenance window"}'
```

---

## MCP Server

Start with `--mcp` for stdio transport (AI agent integration) or configure HTTP transport.

### Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `whtsp_send_text` | `to`, `text` | Send text message |
| `whtsp_send_image` | `to`, `image`, `caption?` | Send image with caption |
| `whtsp_send_video` | `to`, `video`, `caption?` | Send video with caption |
| `whtsp_send_document` | `to`, `document`, `fileName`, `mimetype?` | Send document/file |
| `whtsp_react` | `to`, `emoji`, `messageId` | React to message |
| `whtsp_check_number` | `phone` | Check if number exists |
| `whtsp_get_status` | — | Get connection + anti-ban status |
| `whtsp_get_chats` | — | List recent chats |
| `whtsp_pause` | `reason?` | Pause all outgoing messages |
| `whtsp_resume` | — | Resume sending |
| `whtsp_list_tools` | — | List all available tools |

### HTTP Transport

```bash
# Start (config must have mcp.transport: "http")
node dist/cli.js --mcp --mcp-port 3011

# List tools
curl http://localhost:3011/mcp/tools

# Call tool (JSON-RPC 2.0)
curl -X POST http://localhost:3011/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "whtsp_send_text",
      "arguments": {
        "to": "212600000000@s.whatsapp.net",
        "text": "Hello from MCP!"
      }
    }
  }'
```

---

## Configuration

Config is stored in `<configDir>/whtsp.config.json` and persists across restarts.

### Full Reference

```json
{
  "authDir": "./auth",
  "sessionId": "default",
  "preset": "balanced",

  "maxPerMinute": 10,
  "maxPerHour": 100,
  "maxPerDay": 500,
  "minDelayMs": 1200,
  "maxDelayMs": 5400,

  "warmupDays": 7,
  "warmupDay1Limit": 20,
  "warmupGrowthFactor": 1.8,
  "autoPauseAt": "high",

  "typingIndicators": true,
  "readReceipts": true,
  "presenceUpdates": true,

  "logLevel": "info",

  "api": {
    "enabled": false,
    "port": 3010,
    "host": "0.0.0.0",
    "apiKey": null
  },

  "mcp": {
    "enabled": false,
    "transport": "stdio",
    "port": 3011
  },

  "webhooks": {
    "onMessage": null,
    "onConnect": null,
    "onDisconnect": null,
    "onBan": null
  }
}
```

### Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `authDir` | `string` | `./auth` | Auth session storage directory |
| `sessionId` | `string` | `default` | Session name for multi-account |
| `preset` | `string` | `balanced` | Anti-ban preset (`minimal`/`balanced`/`maximum`) |
| `maxPerMinute` | `number` | `10` | Max messages per minute |
| `maxPerHour` | `number` | `100` | Max messages per hour |
| `maxPerDay` | `number` | `500` | Max messages per day |
| `minDelayMs` | `number` | `1200` | Minimum delay between messages (ms) |
| `maxDelayMs` | `number` | `5400` | Maximum delay between messages (ms) |
| `warmupDays` | `number` | `7` | Number of warmup days |
| `warmupDay1Limit` | `number` | `20` | Message limit on day 1 |
| `warmupGrowthFactor` | `number` | `1.8` | Daily growth multiplier |
| `autoPauseAt` | `string` | `high` | Auto-pause threshold (`low`/`medium`/`high`/`critical`) |
| `typingIndicators` | `boolean` | `true` | Show typing before sending |
| `readReceipts` | `boolean` | `true` | Send read receipts |
| `presenceUpdates` | `boolean` | `true` | Simulate online/offline presence |
| `logLevel` | `string` | `info` | Baileys log level |
| `api.enabled` | `boolean` | `false` | Start REST API on boot |
| `api.port` | `number` | `3010` | API port |
| `api.host` | `string` | `0.0.0.0` | API bind address |
| `api.apiKey` | `string?` | `null` | API key (null = no auth) |
| `mcp.enabled` | `boolean` | `false` | Start MCP on boot |
| `mcp.transport` | `string` | `stdio` | Transport (`stdio`/`http`) |
| `mcp.port` | `number` | `3011` | MCP HTTP port |
| `webhooks.*` | `string?` | `null` | Webhook URLs for events |

---

## Project Structure

```
baileyx/
├── src/
│   ├── core/
│   │   ├── types.ts          # TypeScript interfaces
│   │   └── wa-socket.ts      # Baileys v7 wrapper with reconnect
│   ├── antiban/
│   │   ├── index.ts          # Anti-ban orchestrator
│   │   ├── rate-limiter.ts   # Gaussian jitter rate limiter
│   │   ├── warmup.ts         # 7-day warmup with auto-advance
│   │   ├── health.ts         # Health monitor with risk scoring
│   │   └── presence.ts       # Typing/read/offline simulation
│   ├── api/
│   │   └── server.ts         # Express REST API
│   ├── mcp/
│   │   └── server.ts         # MCP server (stdio/HTTP)
│   ├── config/
│   │   └── manager.ts        # JSON config with deep merge
│   ├── cli.ts                # CLI entry point
│   └── index.ts              # Public exports
├── package.json
├── tsconfig.json
└── README.md
```

---

## Tech Stack

| Component | Version |
|-----------|---------|
| Baileys | v7.0.0-rc.13 |
| TypeScript | 5.7+ |
| Express | 4.21+ |
| Node.js | 18+ |
| Zod | 3.23+ |

---

## Security Notes

- Auth sessions are stored locally in `authDir/sessionId/` — never commit these
- API key is transmitted in headers/query — use HTTPS in production
- `lotusbail` npm package is **malware** — never install it
- Meta detects Baileys at the protocol level — anti-ban reduces risk, doesn't eliminate it

---

## License

Private — All rights reserved.
