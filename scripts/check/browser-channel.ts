/**
 * Which Chromium build the browser checks drive, and what to do when there is
 * none.
 *
 * Every browser check used to hardcode `channel: 'chromium'`, which means
 * Playwright's own downloaded build. That is the right default in CI: the
 * workflow runs `playwright install --with-deps`, the build is pinned by the
 * Playwright version in the lockfile, and the result is reproducible.
 *
 * On a developer machine it is frequently wrong. The download comes from
 * `cdn.playwright.dev`, which is unreachable from some networks; when it fails
 * the checks do not fail with "no browser", they fail with a download timeout
 * that looks like a broken test. Meanwhile a perfectly good Chrome is often
 * already installed at `/Applications/Google Chrome.app`.
 *
 * So: CI keeps the pinned build, and a developer can point the checks at an
 * installed browser without editing them. The choice is explicit rather than
 * silently falling back, because "it worked on my machine against a different
 * browser" is exactly the kind of difference a browser acceptance run must not
 * hide.
 *
 * Usage:
 *
 * ```text
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:runtime-cleanup-browser
 * ```
 *
 * `ZEUS_BROWSER_CHANNEL` accepts any Playwright channel name (`chromium`,
 * `chrome`, `msedge`, `chrome-beta`, …). When unset, the checks use
 * `chromium`, the build `playwright install` puts in the cache.
 */

/** The channel a Chromium-family check should launch. */
export function chromiumChannel(): string {
  const configured = process.env.ZEUS_BROWSER_CHANNEL?.trim()
  return configured && configured.length > 0 ? configured : 'chromium'
}

/**
 * Launch options for a Chromium-family check.
 *
 * Kept in one place so a check cannot drift from the others: two checks
 * running different browser builds in the same acceptance run would make their
 * results incomparable, which is the failure mode this module exists to
 * prevent.
 */
export function chromiumLaunchOptions(): { headless: true; channel: string } {
  return { headless: true, channel: chromiumChannel() }
}

/**
 * Rewrites Playwright's "Executable doesn't exist" failure into something that
 * says what to do about it.
 *
 * Playwright's own message is accurate and unhelpful: it names a cache path and
 * a download command that may be exactly what cannot run on this machine. The
 * two real options are "install the pinned build" and "use a browser you
 * already have", and both should be visible in the error.
 */
export function explainLaunchFailure(channel: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  const missing =
    /Executable doesn't exist|Failed to launch|is not found/i.test(message)
  if (!missing) {
    return error instanceof Error ? error : new Error(message)
  }
  return new Error(
    `could not launch a browser for channel "${channel}".\n` +
      `  Option 1 — install the pinned build (what CI does):\n` +
      `    pnpm exec playwright install --with-deps chromium\n` +
      `  Option 2 — use a browser that is already installed:\n` +
      `    ZEUS_BROWSER_CHANNEL=chrome pnpm <the same command>\n` +
      `  Original error: ${message}`,
  )
}

/**
 * Whether the current run is using the CI-pinned build.
 *
 * Acceptance reports use this to say which browser produced the evidence. A
 * result on an installed Chrome 157 and a result on Playwright's pinned build
 * are both real, but they are not the same claim, and the report should not
 * pretend they are.
 */
export function isPinnedBuild(): boolean {
  return chromiumChannel() === 'chromium'
}

/** One line naming the browser a report's evidence came from. */
export function describeBrowser(): string {
  const channel = chromiumChannel()
  return isPinnedBuild()
    ? 'Playwright pinned chromium (installed by `playwright install`)'
    : `installed browser, channel "${channel}" (NOT the CI-pinned build)`
}

/**
 * Which browser engines a check should run, from `ZEUS_BROWSERS`.
 *
 * An empty or unset value keeps the historical behaviour — all three engines —
 * which is what CI runs. A developer machine usually has one of them, and a
 * check that insists on three cannot run at all there.
 *
 * ```text
 * ZEUS_BROWSERS=chromium pnpm check:runtime-cleanup-browser
 * ```
 */
export function requestedEngines(
  /**
   * A per-check override, for a check that already had its own variable before
   * `ZEUS_BROWSERS` existed. `check-hmr-browser.ts` reads
   * `ZEUS_HMR_BROWSERS` and its CI job sets it; honouring that variable here
   * too would mean two names for one decision, and whichever the workflow
   * forgets to set would silently win. The specific name takes precedence.
   */
  specific?: string,
): Array<'chromium' | 'firefox' | 'webkit'> {
  const configured =
    (specific?.trim() || process.env.ZEUS_BROWSERS?.trim()) ?? ''
  if (!configured) return ['chromium', 'firefox', 'webkit']
  const engines = configured
    .split(',')
    .map(name => name.trim())
    .filter((name): name is 'chromium' | 'firefox' | 'webkit' =>
      ['chromium', 'firefox', 'webkit'].includes(name),
    )
  if (engines.length === 0) {
    throw new Error(
      `ZEUS_BROWSERS="${configured}" names no known engine; use a comma list of chromium, firefox, webkit`,
    )
  }
  return engines
}

/**
 * Whether a launch failure means "this machine cannot run the check" rather
 * than "the code under test is wrong".
 *
 * The distinction matters for the acceptance report: a missing browser is
 * BLOCKED, and calling it a failure would send someone looking for a bug that
 * does not exist. Playwright's message for a missing build is stable enough to
 * match on, and the launch is the only place it can appear.
 */
export function isMissingBrowser(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Executable doesn't exist|Browser was not found|is not found at|download new browsers/i.test(
    message,
  )
}

/**
 * A Playwright launcher paired with the name and launch options for one engine.
 *
 * The new R20/R21 browser checks each launched `chromium` directly, so a change
 * that only affected Firefox or WebKit could not be seen by any of them. This
 * returns the launcher and the options separately because they differ per
 * engine: only a Chromium-family launch takes a `channel`.
 */
export interface EngineTarget {
  readonly name: 'chromium' | 'firefox' | 'webkit'
  readonly launcher: (typeof import('@playwright/test'))['chromium']
  readonly options: { headless: true; channel?: string }
}

/**
 * The engine targets a check should run, from `requestedEngines`.
 *
 * `launchers` is passed in rather than imported so this module stays free of a
 * runtime dependency on `@playwright/test` — it is also imported by checks that
 * only need `chromiumChannel`.
 */
export function engineTargets(
  launchers: {
    chromium: (typeof import('@playwright/test'))['chromium']
    firefox: (typeof import('@playwright/test'))['firefox']
    webkit: (typeof import('@playwright/test'))['webkit']
  },
  specific?: string,
): EngineTarget[] {
  return requestedEngines(specific).map(name => ({
    name,
    launcher: launchers[name],
    // Only Chromium-family launchers accept a channel; passing one to Firefox
    // or WebKit is an error in Playwright.
    options:
      name === 'chromium'
        ? { headless: true as const, channel: chromiumChannel() }
        : { headless: true as const },
  }))
}

/**
 * One line naming the engine and the version that produced a result.
 *
 * A report that says "passed" without saying which browser is the claim this
 * project kept making and having to walk back. `browser.version()` is the real
 * engine version as Playwright reports it, not the channel name.
 */
export function describeEngine(engine: string, version: string): string {
  return `${engine} ${version}`
}
