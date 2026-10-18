# Changelog

## 1.0.0 — 2026-10-18

- Status line with the session's context size, prompt-cache time left, and the 5-hour and 7-day plan limits, including the pace of each window.
- Context nudges once each at 250K, 400K, 500K, 600K, 700K, 750K, 800K, 850K, 900K and 950K tokens, re-armed when the context shrinks.
- Problems are written to Claude Code's debug log.
