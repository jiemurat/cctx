# Claude context, cache and plan limits status

A Claude Code mod that adds a status line with the session's context size, prompt-cache time left and plan limits, and nudges you to start a fresh session as the context grows.

## Install

```
/plugin install cctx --marketplace jiemurat/cctx
```

## What it shows

Example status line:

```
🟠 412K · 38m · 5h 73% 2.1+5.9h · 7d 42% 4.3-2.3d
```

- **Context** — tokens in the current context, in K. Orange from 400K to 700K, red above 700K.
- **Cache** — minutes left before the prompt cache expires. It counts down from the last main-thread request (1 hour TTL). Orange at 10–20 min, red under 10 min.
- **Plan limits** — for the 5-hour and 7-day windows:
  - percent left,
  - time until the window resets,
  - pace: how long the remaining share lasts at the rate used so far, minus the time until reset. `+` means time to spare, `-` means you will run short. `+∞` while nothing is used.

## Context nudges

A toast appears once each time context crosses 250K, 400K, 500K, 600K, 700K, 750K, 800K, 850K, 900K or 950K tokens. If context shrinks (compaction or `/clear`), the nudges re-arm.

## Files

```
.claude-plugin/plugin.json   plugin manifest
hooks/hooks.json             registers hooks/register.ts
hooks/register.ts            event hooks, nudges, cache timer, minute tick
hooks/format.ts              pure status-line formatting
types/index.d.ts             plugin state typing
tests/cctx.test.ts           tests
```

## Logs

Problems are written to Claude Code's debug log, which you can read by starting Claude Code with `claude --debug`.

## Tests

Tests use the `claude-code/testing` helpers and run inside the Claude Code engine.

## Credits

The plugin icon (`logo.svg`) is the `info-circle` icon (outline) from [Tabler Icons](https://github.com/tabler/tabler-icons), used under the MIT License.
