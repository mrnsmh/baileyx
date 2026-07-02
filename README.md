# baileyx

Reinforced Baileys v7 wrapper with anti-ban engine, REST API, MCP server, and JSON config.

## Install

```bash
npm install
npm run build
```

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

## CLI Options

```
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

## Anti-Ban Presets

| Preset | Min/Min | Min/Hour | Min/Day | Delay |
|--------|---------|----------|---------|-------|
| `minimal` | 5 | 50 | 200 | 2-8s |
| `balanced` | 10 | 100 | 500 | 1.2-5.4s |
| `maximum` | 3 | 30 | 100 | 3-12s |

### What the anti-ban engine does

- **Rate limiter**: Gaussian jitter (Box-Muller) instead of fixed delays
- **Warmup**: 7-day ramp-up from 20 msg/day to full capacity
- **Health monitor**: Risk scoring with auto-pause at configurable threshold
- **Presence simulator**: Typing indicators, read receipts, offline gaps

### Important

Anti-ban is **complementary, not a shield**. Meta detects Baileys at the protocol level ([ghsast-1925](https://github.com/WhiskeySockets/Baileys/issues/1925)). For proactive messaging (you initiate), use Cloud API. For reactive messaging (client initiates), Baileys is fine (<2% ban rate).

## Programmatic Usage

```typescript
import { createWhtspClient } from '@whtsp/core'

const client = await createWhtspClient({
  config: { preset: 'balanced' }
})

client.on('connection.update', (event) => {
  if (event.qr) console.log('Scan QR:', event.qr)
  if (event.connection === 'open') console.log('Connected!')
})

client.on('messages.upsert', (event) => {
  for (const msg of event.messages) {
    if (!msg.key.fromMe) {
      console.log('Message:', msg.message?.conversation)
    }
  }
})

await client.sendText('212600000000@s.whatsapp.net', 'Hello!')
await client.disconnect()
```

## REST API

Start with `--api`. All endpoints require `X-Api-Key` header if `apiKey` is configured.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
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

### Send text

```bash
curl -X POST http://localhost:3010/send \
  -H "Content-Type: application/json" \
  -d '{"to": "212600000000@s.whatsapp.net", "text": "Hello!"}'
```

### Send image

```bash
curl -X POST http://localhost:3010/send/image \
  -H "Content-Type: application/json" \
  -d '{"to": "212600000000@s.whatsapp.net", "image": "https://example.com/photo.jpg", "caption": "Check this out"}'
```

### Check number

```bash
curl http://localhost:3010/check/212600000000
```

## MCP Server

Start with `--mcp` for stdio transport (AI agent integration) or configure HTTP transport in config.

### Available Tools

| Tool | Description |
|------|-------------|
| `whtsp_send_text` | Send text message |
| `whtsp_send_image` | Send image with caption |
| `whtsp_send_video` | Send video with caption |
| `whtsp_send_document` | Send document/file |
| `whtsp_react` | React with emoji |
| `whtsp_check_number` | Check if number exists on WhatsApp |
| `whtsp_get_status` | Get connection + anti-ban status |
| `whtsp_get_chats` | List recent chats |
| `whtsp_pause` | Pause all outgoing messages |
| `whtsp_resume` | Resume sending |
| `whtsp_list_tools` | List all tools |

### MCP over HTTP

```bash
# Start with HTTP transport
node dist/cli.js --mcp --mcp-port 3011

# List tools
curl http://localhost:3011/mcp/tools

# Call tool
curl -X POST http://localhost:3011/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whtsp_get_status","arguments":{}}}'
```

## Configuration

Config is stored in `<configDir>/whtsp.config.json`:

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
  "webhooks": {}
}
```

## Project Structure

```
src/
  core/
    types.ts          # TypeScript interfaces
    wa-socket.ts      # Baileys v7 wrapper with reconnect
  antiban/
    index.ts          # Anti-ban orchestrator
    rate-limiter.ts   # Gaussian jitter rate limiter
    warmup.ts         # 7-day warmup with auto-advance
    health.ts         # Health monitor with risk scoring
    presence.ts       # Typing/read/offline simulation
  api/
    server.ts         # Express REST API
  mcp/
    server.ts         # MCP server (stdio/HTTP)
  config/
    manager.ts        # JSON config with deep merge
  cli.ts              # CLI entry point
  index.ts            # Public exports
```

## License

Private
