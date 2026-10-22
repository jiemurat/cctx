import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMeasureInput, SessionUsage, Timer } from 'claude-code'

import { formatStatus } from './format'

// Context sizes, in tokens, that each get one nudge when crossed.
const THRESHOLDS = [300, 400, 500, 600, 700, 750, 800, 850, 900, 950].map(k => k * 1000)
// The prompt cache lives this long after the last request that read or wrote it (this session's TTL).
const CACHE_TTL_MS = 3_600_000
const TICK_MS = 60_000

const level = atom({ plugin: 'cctx', key: 'level' } as const, 0)
const lastRequestAt = atom({ plugin: 'cctx', key: 'lastRequestAt' } as const, null)

// The last figures the engine measured, and the minute tick that redraws them between measurements.
// Both are lost when the engine replaces this module's copy; the next hook or tick brings them back.
let usage: SessionUsage | SessionMeasureInput | undefined
let tick: Timer | undefined

function nudge(threshold: number): string {
  return `Kontekst ${threshold / 1000}K tokendan oshdi. Handoff qilib, yangi sessiya boshlash vaqti: har bir so'rov butun kontekstni qayta o'qiydi.`
}

// What went wrong goes to Claude Code's debug log (claude --debug), not to a file of its own.
function log($: EngineInterface, what: string, detail: unknown): void {
  try {
    const text = detail instanceof Error ? detail.message : JSON.stringify(detail)
    $.ui.log(`${what}: ${text}`.slice(0, 2000), { to: 'debug' })
  } catch {
    // The log is a help, never a reason to fail.
  }
}

async function render($: EngineInterface): Promise<void> {
  if (!usage) usage = await $.session.usage()
  const now = await $.clock.now()
  const last = await read($, lastRequestAt)
  const text = formatStatus(usage, now, last === null ? undefined : last + CACHE_TTL_MS - now)
  // A reading with nothing to show keeps the line as it was rather than clearing it.
  if (text === undefined) return log($, 'nothing to show', usage)
  $.ui.status(text)
}

async function show($: EngineInterface, u: SessionUsage | SessionMeasureInput): Promise<void> {
  usage = u
  await render($)

  const tokens = u.context?.tokens
  if (typeof tokens !== 'number' || !Number.isFinite(tokens)) return
  const reached = THRESHOLDS.filter(t => t <= tokens).at(-1) ?? 0
  const shown = await read($, level)
  if (reached > shown) $.ui.toast(nudge(reached), { timeoutMs: 15_000 })
  // Compaction or /clear shrinks the context: the thresholds above it nudge again when crossed.
  if (reached !== shown) await update($, level, () => reached)
}

async function safely($: EngineInterface, what: string, work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch (err) {
    await log($, what, err)
  }
}

// Each minute asks the engine afresh, so the line returns even if a measurement was missed or lost.
function ensureTick($: EngineInterface): void {
  if (tick) return
  tick = $.clock.every(TICK_MS, () => {
    void safely($, 'tick', async () => {
      usage = await $.session.usage()
      await render($)
    })
  })
}

export const register: Register = on => {
  usage = undefined
  tick = undefined

  // A reload swaps this module in and clears its line, but raises session.start only for changed
  // modules, unless some module hooks plugin.register. This pass-through judge, which admits every
  // module as it is, makes each reload raise session.start here, so the line is drawn again at once.
  on('plugin.register', ($, e, next) => next(e)).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await safely($, 'session.start', async () => show($, await $.session.usage()))
    ensureTick($)
    return result
  })

  on('session.measure', async ($, e, next) => {
    await safely($, 'session.measure', () => show($, e))
    ensureTick($)
    return next(e)
  })

  // Each main-thread request reads the cache and starts its lifetime afresh.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await safely($, 'turn.step', async () => {
        const now = await $.clock.now()
        await update($, lastRequestAt, () => now)
      })
    }
    return yield* next(e)
  })
}
