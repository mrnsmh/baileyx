// ─── Core ──────────────────────────────────────────────────────────────
export { createWhtspClient } from './core/wa-socket.js'
export type { CreateClientOptions } from './core/wa-socket.js'
export type {
  WhtspConfig,
  WhtspClient,
  WhtspEvent,
  MessageEvent,
  ConnectionEvent,
  SendMessageRequest,
  SendResponse,
  StatusResponse,
  HealthStatus,
  WarmUpState,
  AntiBanState,
  SendDecision,
  BanRiskLevel,
} from './core/types.js'

// ─── Anti-ban ──────────────────────────────────────────────────────────
export { AntiBan } from './antiban/index.js'
export type { AntiBanConfig } from './antiban/index.js'
export { RateLimiter } from './antiban/rate-limiter.js'
export { WarmUp } from './antiban/warmup.js'
export { HealthMonitor } from './antiban/health.js'
export { PresenceSimulator } from './antiban/presence.js'
export { ContactGraph } from './antiban/contact-graph.js'
export { DeliveryTracker } from './antiban/delivery-tracker.js'
export { ReconnectThrottle } from './antiban/reconnect-throttle.js'
export { LegitimacyInjector } from './antiban/legitimacy.js'
export { getCircadianMultiplier, applyCircadianDelay } from './antiban/circadian.js'
export type { CircadianProfile } from './antiban/circadian.js'
export { classifyDisconnect } from './antiban/disconnect-classifier.js'
export { computeTypingPlan, executeTypingPlan, getTypingDuration } from './antiban/typing-model.js'

// ─── Config ────────────────────────────────────────────────────────────
export { ConfigManager, loadConfig, saveConfig } from './config/index.js'

// ─── API ───────────────────────────────────────────────────────────────
export { ApiServer } from './api/index.js'
export type { ApiServerOptions } from './api/index.js'

// ─── MCP ───────────────────────────────────────────────────────────────
export { McpServer } from './mcp/index.js'
export type { McpTool, McpServerOptions } from './mcp/index.js'
