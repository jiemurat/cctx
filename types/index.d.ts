/** The highest context threshold, in tokens, already nudged about (0 for none); lowered when context shrinks. */
export type Level = number
/** When the last main-thread model request started, in milliseconds since the epoch (null before the first). */
export type LastRequestAt = number | null

declare module 'claude-code' {
  interface PluginState {
    'cctx': { level: Level; lastRequestAt: LastRequestAt }
  }
}
