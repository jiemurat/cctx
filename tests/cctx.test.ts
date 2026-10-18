import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { formatStatus } from '../hooks/format'

function measure(tokens: number) {
  return {
    context: { tokens, window: 1_000_000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 61.6 },
      { kind: 'seven_day', percentUsed: 18 },
    ],
    changed: ['context' as const],
  }
}

test('status: context in K, what is left of the plan windows', () => {
  expect(formatStatus(measure(412_345))).toBe('🟠 412K · 5h 38% · 7d 82%')
  expect(formatStatus({ context: { tokens: 1_500, window: 200_000 }, rateLimits: [] })).toBe('2K')
  expect(formatStatus({ context: { window: 200_000 }, rateLimits: [] })).toBeUndefined()
})

test('dots: context orange 400K-700K, red above; cache orange 20-10 min, red under 10', () => {
  const ctx = (tokens: number) => formatStatus({ context: { tokens, window: 1_000_000 }, rateLimits: [] })
  expect([399_000, 400_000, 700_000, 701_000].map(ctx)).toEqual(['399K', '🟠 400K', '🟠 700K', '🔴 701K'])

  const cache = (minutes: number) => formatStatus({ context: { window: 1_000_000 }, rateLimits: [] }, 0, minutes * 60_000)
  expect([21, 20, 10, 9, 0].map(cache)).toEqual(['21m', '🟠 20m', '🟠 10m', '🔴 9m', '🔴 0m'])
})

function world(on: On) {
  const status: (string | undefined)[] = []
  const toasts: string[] = []
  on('ui.status', ($, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  return { status, toasts }
}

test('one nudge per threshold crossed, re-armed when context shrinks', async ($, on) => {
  const { status, toasts } = world(on)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00Z') }))

  await $.session.measure(measure(240_000))
  await $.session.measure(measure(260_000))
  await $.session.measure(measure(300_000))
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('250K')
  expect(status.at(-1)).toBe('300K · 5h 38% · 7d 82%')

  await $.session.measure(measure(150_000))
  await $.session.measure(measure(255_000))
  expect(toasts).toHaveLength(2)
})

test('nudges at 250K to 950K; a jump past several says the highest once', async ($, on) => {
  const { toasts } = world(on)
  on('clock.now', () => ({ value: 0 }))

  for (const k of [250, 399, 400, 500, 600, 700, 750, 800, 850, 900, 950, 990]) {
    await $.session.measure(measure(k * 1000))
  }
  expect(toasts.map(t => t.split(' ')[1])).toEqual([
    '250K', '400K', '500K', '600K', '700K', '750K', '800K', '850K', '900K', '950K',
  ])

  await $.session.measure(measure(100_000))
  await $.session.measure(measure(620_000))
  expect(toasts.at(-1)?.split(' ')[1]).toBe('600K')
  expect(toasts).toHaveLength(11)
})

test('cache: counts down from the last main request, ticking without messages', async ($, on) => {
  const { status } = world(on)
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 50_000, window: 1_000_000 }, rateLimits: [] },
  }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })

  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  expect(status.at(-1)).toBe('50K')

  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1 })) void _
  for await (const _ of $.turn.step({ turnId: 't', index: 1, model: 'm', messageCount: 2, agentId: 'sub' })) void _
  await $.session.measure({ ...measure(50_000), rateLimits: [] })
  expect(status.at(-1)).toBe('50K · 60m')

  await clock.advance(22 * 60_000)
  expect(status.at(-1)).toBe('50K · 38m')

  await clock.advance(40 * 60_000)
  expect(status.at(-1)).toBe('50K · 🔴 0m')
})

test('partial or odd readings: missing or non-finite figures are left out, nothing throws', () => {
  const now = Date.parse('2026-10-17T12:00:00Z')
  const ctx = { tokens: 420_000, window: 1_000_000 }
  const odd = (u: object, cacheLeftMs?: number) => formatStatus(u as Parameters<typeof formatStatus>[0], now, cacheLeftMs)
  expect(odd({ context: ctx })).toBe('🟠 420K')
  expect(odd({ rateLimits: [] })).toBeUndefined()
  expect(odd({ context: { tokens: Number.NaN, window: 1 }, rateLimits: [] })).toBeUndefined()
  expect(odd({ context: ctx, rateLimits: [{ kind: 'five_hour', percentUsed: Number.NaN }] })).toBe('🟠 420K')
  expect(odd({ context: ctx, rateLimits: [{ kind: 'five_hour', percentUsed: 30, resetsAt: 'garbage' }] })).toBe('🟠 420K · 5h 70%')
  expect(odd({ context: ctx, rateLimits: [null, { kind: 'spend_limit', percentUsed: 5 }] })).toBe('🟠 420K')
  expect(odd({ context: ctx, rateLimits: [] }, Number.NaN)).toBe('🟠 420K')
})

test('a reading with nothing to show keeps the line and is logged; a failed tick does not stop the next', async ($, on) => {
  const { status } = world(on)
  const clock = mock.clock(on, { now: 1_000_000 })
  const logs: string[] = []
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  let calls = 0
  on('session.usage', () => {
    calls += 1
    if (calls === 2) return { deny: 'server said nothing' }
    return { value: { startedAt: 0, context: { tokens: 60_000, window: 1_000_000 }, rateLimits: [] } }
  })

  await $.session.measure(measure(50_000))
  expect(status.at(-1)).toBe('50K · 5h 38% · 7d 82%')

  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['rateLimits'] })
  expect(status.at(-1)).toBe('50K · 5h 38% · 7d 82%')
  expect(logs.join('\n')).toContain('nothing to show')

  await clock.advance(60_000)
  await clock.advance(60_000)
  expect(logs.join('\n')).toContain('tick')
  await clock.advance(60_000)
  expect(status.at(-1)).toBe('60K')
})

test('pace: time until reset, then how long the share left lasts at the pace so far minus that time', () => {
  const now = Date.parse('2026-10-15T12:00:00Z')
  const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString()
  const u = (fiveUsed: number, fiveReset: number, sevenUsed: number, sevenReset: number) => ({
    context: { window: 1_000_000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: fiveUsed, resetsAt: at(fiveReset) },
      { kind: 'seven_day', percentUsed: sevenUsed, resetsAt: at(sevenReset) },
    ],
  })
  // 5h: 27% in 2.95h, 73% lasts 7.98h, reset in 2.05h -> +5.9h; 7d: 58% in 2.71d, 42% lasts 1.96d, reset in 4.29d -> -2.3d
  expect(formatStatus(u(27, 2.05, 58, 103), now)).toBe('5h 73% 2.1+5.9h · 7d 42% 4.3-2.3d')
  // 5h: 61.6% in 2.5h, 38.4% lasts 1.56h, reset in 2.5h -> -0.9h; 7d: 18% in 3.5d, 82% lasts 15.94d, reset in 3.5d -> +12.4d
  expect(formatStatus(u(61.6, 2.5, 18, 84), now)).toBe('5h 38% 2.5-0.9h · 7d 82% 3.5+12.4d')
  // pace that ends exactly at the reset -> +0.0
  expect(formatStatus(u(50, 2.5, 50, 84), now)).toBe('5h 50% 2.5+0.0h · 7d 50% 3.5+0.0d')
  // nothing used yet -> lasts forever
  expect(formatStatus(u(0, 4, 0, 160), now)).toBe('5h 100% 4.0+∞h · 7d 100% 6.7+∞d')
  // no clock or no reset time -> no difference
  expect(formatStatus(u(61.6, 2.5, 18, 84))).toBe('5h 38% · 7d 82%')
})
