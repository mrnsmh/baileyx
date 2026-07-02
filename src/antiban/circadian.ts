export type CircadianProfile = 'default' | 'nightOwl' | 'earlyBird' | 'always_on'

interface TimeSlot {
  startHour: number
  endHour: number
  multiplier: number
}

const PROFILES: Record<CircadianProfile, TimeSlot[]> = {
  default: [
    { startHour: 2, endHour: 6, multiplier: 4.5 },
    { startHour: 6, endHour: 9, multiplier: 1.8 },
    { startHour: 9, endHour: 22, multiplier: 1.0 },
    { startHour: 22, endHour: 24, multiplier: 2.0 },
    { startHour: 0, endHour: 2, multiplier: 3.0 },
  ],
  nightOwl: [
    { startHour: 4, endHour: 9, multiplier: 5.0 },
    { startHour: 9, endHour: 12, multiplier: 1.5 },
    { startHour: 12, endHour: 2, multiplier: 1.0 },
    { startHour: 2, endHour: 4, multiplier: 3.5 },
  ],
  earlyBird: [
    { startHour: 23, endHour: 4, multiplier: 5.0 },
    { startHour: 4, endHour: 6, multiplier: 1.8 },
    { startHour: 6, endHour: 20, multiplier: 1.0 },
    { startHour: 20, endHour: 23, multiplier: 2.0 },
  ],
  always_on: [
    { startHour: 0, endHour: 24, multiplier: 1.0 },
  ],
}

/**
 * Get circadian multiplier based on time of day.
 * Uses smooth cosine transitions between time slots.
 */
export function getCircadianMultiplier(
  now: Date,
  profile: CircadianProfile = 'default',
  timezone: string = 'UTC',
): number {
  const slots = PROFILES[profile]
  const hour = getLocalHour(now, timezone)

  for (const slot of slots) {
    if (isInRange(hour, slot.startHour, slot.endHour)) {
      const progress = getSlotProgress(hour, slot.startHour, slot.endHour)
      const nextSlot = getNextSlot(slots, slot)
      const smooth = (1 - Math.cos(progress * Math.PI)) / 2
      return slot.multiplier + (nextSlot.multiplier - slot.multiplier) * smooth
    }
  }

  return 1.0
}

function getLocalHour(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    })
    return parseInt(formatter.format(date), 10)
  } catch {
    return date.getUTCHours()
  }
}

function isInRange(hour: number, start: number, end: number): boolean {
  if (start < end) {
    return hour >= start && hour < end
  }
  return hour >= start || hour < end
}

function getSlotProgress(hour: number, start: number, end: number): number {
  const total = start < end ? end - start : 24 - start + end
  const elapsed = start < end ? hour - start : 24 - start + hour
  return Math.max(0, Math.min(1, elapsed / total))
}

function getNextSlot(slots: TimeSlot[], current: TimeSlot): TimeSlot {
  const idx = slots.indexOf(current)
  return slots[(idx + 1) % slots.length]!
}

/**
 * Apply circadian multiplier to a delay.
 */
export function applyCircadianDelay(
  baseDelayMs: number,
  now: Date,
  profile: CircadianProfile = 'default',
  timezone: string = 'UTC',
): number {
  const multiplier = getCircadianMultiplier(now, profile, timezone)
  return Math.round(baseDelayMs * multiplier)
}
