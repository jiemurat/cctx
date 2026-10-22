# Changelog

## 1.0.1 — 2026-10-22

- The first context nudge comes at 300K tokens instead of 250K.
- Each plan window shows its rate, such as `0.5x`: the share used against the share of the window passed.
- The rate shows only from `0.1x` to `9.9x`, and the pace only from `-9.9` to `+9.9`; `+∞` is no longer shown.

## 1.0.0 — 2026-10-18

- Status line with the session's context size, prompt-cache time left, and the 5-hour and 7-day plan limits, including the pace of each window.
- Context nudges once each at 250K, 400K, 500K, 600K, 700K, 750K, 800K, 850K, 900K and 950K tokens, re-armed when the context shrinks.
- Problems are written to Claude Code's debug log.
