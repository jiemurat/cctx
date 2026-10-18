import type { SessionContextUsage, SessionRateLimit } from 'claude-code'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WINDOWS: Record<string, { label: string; ms: number; unitMs: number; unit: string }> = {
  five_hour: { label: '5h', ms: 5 * HOUR, unitMs: HOUR, unit: 'h' },
  seven_day: { label: '7d', ms: 7 * DAY, unitMs: DAY, unit: 'd' },
}

// Marks before a value that needs attention: context 400K-700K or cache 10-20 min orange, beyond that red.
const ORANGE = '🟠 '
const RED = '🔴 '

/**
 * "🟠 412K · 38m · 5h 73% 2.1+5.9h · 7d 42% 4.3-2.3d": the context size and
 * estimated time left before the prompt cache expires, when `cacheLeftMs` is given; each window shows what
 * is left of the limit, the time until it resets, then how long the left share lasts at the pace used
 * so far in the window minus that time: plus is time to spare, minus is time short; "+∞" while nothing is used.
 */
export function formatStatus(
  u: {
    context?: SessionContextUsage
    rateLimits?: readonly SessionRateLimit[]
  },
  now?: number,
  cacheLeftMs?: number,
): string | undefined {
  // A reading the engine gives in part (a fresh window, a limit mid-reset) loses only the
  // figures it lacks: anything missing or not a finite number is left out, and nothing here throws.
  const parts: string[] = []
  const tokens = u.context?.tokens
  if (isFiniteNumber(tokens)) {
    const k = Math.round(tokens / 1000)
    parts.push(`${k > 700 ? RED : k >= 400 ? ORANGE : ''}${k}K`)
  }
  if (isFiniteNumber(cacheLeftMs)) {
    const m = Math.ceil(Math.max(0, cacheLeftMs) / 60_000)
    parts.push(`${m < 10 ? RED : m <= 20 ? ORANGE : ''}${m}m`)
  }
  for (const limit of Array.isArray(u.rateLimits) ? u.rateLimits : []) {
    const window = WINDOWS[limit?.kind]
    if (!window || !isFiniteNumber(limit.percentUsed)) continue
    const used = Math.max(0, limit.percentUsed)
    let text = `${window.label} ${Math.max(0, Math.round(100 - used))}%`
    const resetsAt = typeof limit.resetsAt === 'string' ? Date.parse(limit.resetsAt) : NaN
    if (isFiniteNumber(now) && Number.isFinite(resetsAt)) {
      const untilReset = Math.min(window.ms, Math.max(0, resetsAt - now))
      const elapsed = window.ms - untilReset
      const spare = used === 0 ? '+∞' : formatSpan(((Math.max(0, 100 - used) * elapsed) / used - untilReset) / window.unitMs)
      text += ` ${(Math.round((untilReset / window.unitMs) * 10) / 10).toFixed(1)}${spare}${window.unit}`
    }
    parts.push(text)
  }
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** "+5.9", "-2.3", "+0.0": a signed span in the window's unit, one decimal. */
function formatSpan(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded < 0 ? '-' : '+'}${Math.abs(rounded).toFixed(1)}`
}
