/**
 * Injects realistic imperfections into messages to avoid "too perfect" detection.
 * WhatsApp ML flags accounts with zero variation in behavior.
 */

const ZERO_WIDTH_CHARS = [
  '\u200B', // zero-width space
  '\u200C', // zero-width non-joiner
  '\u200D', // zero-width joiner
  '\uFEFF', // zero-width no-break space
  '\u2060', // word joiner
]

const PUNCTUATION_VARIATIONS: Record<string, string[]> = {
  '!': ['!', '!!', '!'],
  '?': ['?', '??', '?'],
  '...': ['...', '…', '...'],
  ',': [',', ' ,', ','],
}

const COMMON_SYNONYMS: Record<string, string[]> = {
  hello: ['hi', 'hey', 'hello'],
  hi: ['hello', 'hey', 'hi'],
  goodbye: ['bye', 'see you', 'goodbye'],
  thanks: ['thank you', 'thx', 'thanks'],
  ok: ['okay', 'ok', 'alright'],
  yes: ['yeah', 'yes', 'yep'],
  no: ['no', 'nah', 'nope'],
  good: ['great', 'good', 'nice'],
  bad: ['bad', 'not good', 'terrible'],
  help: ['help', 'assist', 'hand'],
}

export interface LegitimacyConfig {
  /** Probability of injecting a typo (0-1). Default: 0.025 */
  typoProbability: number
  /** Probability of adding read gaps. Default: 0.15 */
  readGapProbability: number
  /** Probability of mid-typing pause. Default: 0.08 */
  thinkPauseProbability: number
  /** Enable zero-width character injection. Default: true */
  zeroWidthChars: boolean
  /** Enable punctuation variation. Default: true */
  punctuationVariation: boolean
  /** Enable synonym replacement. Default: false (risky for business messages) */
  synonyms: boolean
}

const DEFAULT_CONFIG: LegitimacyConfig = {
  typoProbability: 0.025,
  readGapProbability: 0.15,
  thinkPauseProbability: 0.08,
  zeroWidthChars: true,
  punctuationVariation: true,
  synonyms: false,
}

export class LegitimacyInjector {
  private config: LegitimacyConfig

  constructor(config: Partial<LegitimacyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Add subtle variations to a message to avoid identical message detection.
   */
  varyMessage(text: string): string {
    let result = text

    if (this.config.zeroWidthChars && Math.random() < 0.3) {
      result = this.injectZeroWidth(result)
    }

    if (this.config.punctuationVariation && Math.random() < 0.2) {
      result = this.varyPunctuation(result)
    }

    if (this.config.synonyms && Math.random() < 0.1) {
      result = this.replaceSynonyms(result)
    }

    return result
  }

  /**
   * Check if we should simulate a read gap before responding.
   */
  shouldReadGap(): boolean {
    return Math.random() < this.config.readGapProbability
  }

  /**
   * Get read gap delay in ms (2-8 seconds).
   */
  getReadGapDelay(): number {
    return 2000 + Math.random() * 6000
  }

  /**
   * Check if we should simulate a think pause mid-typing.
   */
  shouldThinkPause(): boolean {
    return Math.random() < this.config.thinkPauseProbability
  }

  /**
   * Get think pause duration in ms (0.8-3.5 seconds).
   */
  getThinkPauseDelay(): number {
    return 800 + Math.random() * 2700
  }

  /**
   * Check if we should inject a typo.
   */
  shouldTypo(): boolean {
    return Math.random() < this.config.typoProbability
  }

  private injectZeroWidth(text: string): string {
    const chars = text.split('')
    if (chars.length < 3) return text

    const pos = 2 + Math.floor(Math.random() * (chars.length - 2))
    const zw = ZERO_WIDTH_CHARS[Math.floor(Math.random() * ZERO_WIDTH_CHARS.length)]!
    chars.splice(pos, 0, zw)
    return chars.join('')
  }

  private varyPunctuation(text: string): string {
    let result = text
    for (const [char, variations] of Object.entries(PUNCTUATION_VARIATIONS)) {
      if (result.includes(char)) {
        result = result.replace(char, variations[Math.floor(Math.random() * variations.length)]!)
      }
    }
    return result
  }

  private replaceSynonyms(text: string): string {
    const words = text.split(' ')
    return words.map(word => {
      const lower = word.toLowerCase()
      const synonyms = COMMON_SYNONYMS[lower]
      if (synonyms && Math.random() < 0.3) {
        const replacement = synonyms[Math.floor(Math.random() * synonyms.length)]!
        if (word[0] === word[0]!.toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1)
        }
        return replacement
      }
      return word
    }).join(' ')
  }
}
