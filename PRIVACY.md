# Privacy

cctx does not collect, store, or send personal data.

- It reads usage figures that Claude Code provides for the current session: context size, cache timing, and plan limit percentages. It uses them only to draw the status line and nudges in your local Claude Code.
- It keeps two values, the last nudge level and the time of the last request, in Claude Code's own plugin state on your machine.
- It makes no network requests and writes no files.
- Problems are written to Claude Code's debug log, which stays on your machine.
