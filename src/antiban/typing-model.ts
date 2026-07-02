/**
 * WPM typing model — realistic typing duration based on message length.
 * Real humans type 40-60 WPM with variance. Bots that fire composing then
 * immediately send are detectable.
 */

export interface TypingModelConfig {
  /** Average words per minute. Default: 45 */
  wpm: number
  /** WPM standard deviation. Default: 15 */
  wpmStdDev: number
  /** Probability of think pause per 10 chars. Default: 0.08 */
  thinkPauseProbability: number
  /** Min think pause ms. Default: 800 */
  thinkPauseMinMs: number
  /** Max think pause ms. Default: 3500 */
  thinkPauseMaxMs: number
  /** Composing pause duration range [min, max] ms. Default: [500, 2000] */
  composingPauseMs: [number, number]
}

const DEFAULT_CONFIG: TypingModelConfig = {
  wpm: 45,
  wpmStdDev: 15,
  thinkPauseProbability: 0.08,
  thinkPauseMinMs: 800,
  thinkPauseMaxMs: 3500,
  composingPauseMs: [500, 2000],
}

export interface TypingStep {
  state: 'composing' | 'paused'
  durationMs: number
}

/**
 * Sample from a Gaussian distribution using Box-Muller transform.
 */
function gaussianSample(mean: number, stdDev: number): number {
  const u1 = Math.random() || 1e-10
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * stdDev
}

/**
 * Compute a realistic typing plan for a message.
 * Returns an array of composing/paused steps.
 */
export function computeTypingPlan(
  messageLength: number,
  config: Partial<TypingModelConfig> = {},
): TypingStep[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const steps: TypingStep[] = []

  // Sample WPM from Gaussian distribution
  const sampledWpm = Math.max(20, gaussianSample(cfg.wpm, cfg.wpmStdDev))
  const charsPerSec = (sampledWpm * 5) / 60 // ~5 chars per word
  const totalTypingMs = (messageLength / charsPerSec) * 1000

  // Split into chunks with think pauses
  let remainingMs = totalTypingMs
  let charsRemaining = messageLength

  while (charsRemaining > 0) {
    // Decide if we add a think pause
    if (charsRemaining > 10 && Math.random() < cfg.thinkPauseProbability) {
      const thinkPause = cfg.thinkPauseMinMs + Math.random() * (cfg.thinkPauseMaxMs - cfg.thinkPauseMinMs)
      steps.push({ state: 'paused', durationMs: Math.round(thinkPause) })
    }

    // Type a chunk
    const chunkSize = Math.min(charsRemaining, 5 + Math.floor(Math.random() * 15))
    const chunkMs = (chunkSize / charsPerSec) * 1000
    steps.push({ state: 'composing', durationMs: Math.round(chunkMs) })

    charsRemaining -= chunkSize
    remainingMs -= chunkMs

    // Add a brief composing pause between chunks
    if (charsRemaining > 0) {
      const pause = cfg.composingPauseMs[0] + Math.random() * (cfg.composingPauseMs[1] - cfg.composingPauseMs[0])
      steps.push({ state: 'paused', durationMs: Math.round(pause) })
    }
  }

  return steps
}

/**
 * Get total typing duration from a plan.
 */
export function getTypingDuration(plan: TypingStep[]): number {
  return plan.reduce((sum, step) => sum + step.durationMs, 0)
}

/**
 * Execute a typing plan on a Baileys socket.
 */
export async function executeTypingPlan(
  sock: { sendPresenceUpdate: (state: 'composing' | 'paused', jid: string) => Promise<void> },
  jid: string,
  plan: TypingStep[],
  signal?: AbortSignal,
): Promise<void> {
  for (const step of plan) {
    if (signal?.aborted) return
    try {
      await sock.sendPresenceUpdate(step.state, jid)
    } catch {
      // Presence errors are non-fatal
    }
    await new Promise(resolve => setTimeout(resolve, step.durationMs))
  }
}
