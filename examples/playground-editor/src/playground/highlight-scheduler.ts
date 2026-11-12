/**
 * The asynchronous highlighter behind the Output panel.
 *
 * The Output tab shows compiler output. Colouring it pulls in
 * `@codemirror/lang-javascript` and, transitively, `@codemirror/view`,
 * `state`, `language`, `autocomplete` and `@lezer/javascript` — about 370 KB of
 * minified JavaScript that the shell, the editor and the preview never touch.
 * It is therefore a dynamic import, which makes this module a state machine with
 * three outcomes:
 *
 *   pending  the chunk is loading — show escaped plain text
 *   ready    colour the code
 *   failed   the chunk could not load — keep the escaped plain text
 *
 * The rules, all of which the previous inline implementation got wrong:
 *
 *   1. **Never leave the panel blank while loading.** A `code` element with no
 *      content is indistinguishable from "there is no output yet"; escaped text
 *      is both readable and exactly what the highlighter falls back to, so the
 *      slow path degrades to the same thing.
 *   2. **Never let a rejection escape.** A failed chunk load in a `void
 *      import().then(…)` becomes an unhandled rejection, which surfaces as a
 *      console error the user cannot act on. It is caught and the plain text
 *      stays.
 *   3. **Never write a stale result.** The code can change, or the element can
 *      be removed, while the chunk is in flight. Both are checked before writing.
 *   4. **Retry a failed load on the next code change.** A transient network
 *      failure should not disable highlighting for the rest of the session, but
 *      it must not re-request on every keystroke either: the failure is
 *      remembered per attempt, not permanently.
 */

export type HighlightState = 'ready' | 'loading' | 'failed'

export interface HighlightOutcome {
  readonly html: string
  readonly state: HighlightState
  /** Present only on `failed`, for the console; never shown to the user. */
  readonly error?: string
}

/** Escapes text for insertion as HTML text content. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export interface HighlighterLoader {
  /** Resolves the highlight function, or rejects when the chunk cannot load. */
  (): Promise<(code: string) => string>
}

export interface HighlightSchedulerOptions {
  /** Loads the highlighter. Defaults to the dynamic import of `./highlight`. */
  readonly load?: HighlighterLoader
  /** Called with every outcome. The panel writes `html` and records `state`. */
  readonly onOutcome: (outcome: HighlightOutcome) => void
}

/**
 * Creates a scheduler that resolves the highlighter once and reuses it.
 *
 * The returned `schedule` is safe to call on every render: it coalesces on the
 * code string, so switching tabs re-reads a cached result instead of redoing the
 * work.
 */
export function createHighlightScheduler(
  options: HighlightSchedulerOptions,
): (code: string) => void {
  const load =
    options.load ??
    (async () => {
      const module = await import('./highlight')
      return module.highlightCode
    })

  let highlighter: ((code: string) => string) | undefined
  let pending: Promise<void> | undefined
  let failed = false
  /** The last code an outcome was produced for, so a repeat call is a no-op. */
  let lastCode: string | undefined
  /** Increments per request; only the newest request may write. */
  let generation = 0

  return function schedule(code: string): void {
    if (code === lastCode) return
    lastCode = code
    // Every schedule takes a new generation, including one that finds a load
    // already in flight. The in-flight `then` compares its own request number to
    // this value, so a result for a superseded code string cannot be written —
    // that is what stops a slow chunk from overwriting newer output with old.
    const request = ++generation

    if (highlighter) {
      options.onOutcome({ html: highlighter(code), state: 'ready' })
      return
    }

    // Show readable text immediately, including after a failed attempt: the
    // panel is never blank and never empty while waiting.
    options.onOutcome({ html: escapeHtml(code), state: 'loading' })

    if (pending) return
    // A previous attempt failed. This call is a fresh code string, so it is a
    // reasonable moment to try again rather than leaving the panel plain for
    // the rest of the session.
    if (failed) failed = false

    pending = load()
      .then(resolved => {
        highlighter = resolved
        if (request !== generation) return
        options.onOutcome({ html: resolved(code), state: 'ready' })
      })
      .catch(error => {
        failed = true
        if (request !== generation) return
        // `code` here is the string this attempt started with; the caller's
        // element may already show newer text, which `generation` protects.
        options.onOutcome({
          html: escapeHtml(code),
          state: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        pending = undefined
      })

    void pending
  }
}

/**
 * The HTML to show for a code string when no highlighter is available.
 *
 * Exported so the component and the tests agree on the fallback rather than
 * duplicating the escape rules.
 */
export function fallbackHtml(code: string, empty: string): string {
  return code === '' ? empty : escapeHtml(code)
}
