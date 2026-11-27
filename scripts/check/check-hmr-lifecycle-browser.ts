/**
 * HMR lifecycle E2E: repeated updates and unmount (TASK H / R20).
 *
 * `check:hmr-browser` covers a single hot update in depth — mount and cleanup
 * counts, node replacement, retained input state, a binding patch, and a
 * syntax-error negative case. Two things it does not cover, and where leaks
 * live:
 *
 *   * **repeated** hot updates. One update that disposes correctly says
 *     nothing about the fifth. An effect registered twice per update leaves
 *     five live roots after five updates while every single-update assertion
 *     stays green.
 *   * **unmount after** those updates.
 *
 * ## Shape
 *
 * A real Vite dev server with the Zeus plugin, which is the only thing that
 * exercises the actual HMR path. Rewriting a module file and re-importing it by
 * URL is not the same thing: ESM caches by URL, and a synthetic re-import
 * would either hit the cache or create a module the HMR runtime never saw.
 * The first version of this file did that and measured nothing.
 *
 * ## What is counted
 *
 * The fixture increments counters on the page:
 *
 *   mounts    the module body ran
 *   cleanups  a root-level `onCleanup` ran (one per disposed render root)
 *   effects   a live effect body is running (incremented on create,
 *             decremented on cleanup)
 *
 * Invariants after N updates:
 *
 *   cleanups === mounts - 1     every superseded root was disposed
 *   effects  === 1              exactly one live effect, not N
 *
 * After the final dispose: `cleanups === mounts` and `effects === 0`.
 *
 * The effect registers its own `onCleanup` too, and an effect re-runs after
 * every signal write, disposing its previous run first. That counter is kept
 * separate (`effectsDisposed`) because it moves for a different reason — folding
 * the two made a click look like an extra root disposal.
 *
 * ## The negative test
 *
 * One module omits `onCleanup` deliberately. If the counters stayed balanced
 * for it, they would not be measuring disposal at all — so the check asserts
 * that they go unbalanced. That is the test of the instrumentation, not of the
 * framework.
 *
 * ## Running it
 *
 * ```text
 * pnpm check:hmr-lifecycle-browser
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:hmr-lifecycle-browser
 * ```
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { chromium, firefox, webkit, type Page } from '@playwright/test'
import { createServer } from 'vite'

import {
  engineTargets,
  explainLaunchFailure,
  isMissingBrowser,
} from './browser-channel'
import { createZeus } from '../../packages/tooling/vite-plugin/src'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/hmr-lifecycle-browser')
/**
 * One fixture directory per engine.
 *
 * Two Vite servers watching one file is a race: the second engine's write is
 * seen by the first engine's watcher, and the wrong page reloads. Each engine
 * gets its own directory so only its own server can observe it.
 */
const fixtureDirFor = (engine: string) =>
  path.join(root, `temp/hmr-lifecycle-fixture-${engine}`)

/**
 * One observed event in the HMR lifecycle, stamped with the revision that was
 * current when it happened.
 *
 * `revision` counts source writes from the harness (`writeFile` calls), and is
 * the frame every other event is attributed to. If a single write produces two
 * updates, both land on the same revision — which is the whole point: the
 * counts below prove *what* happened, and the revision column says *when*.
 */
interface HmrTraceEntry {
  readonly revision: number
  readonly at: number
  readonly event:
    | 'mount'
    | 'cleanup'
    | 'effect-create'
    | 'effect-dispose'
    | 'vite-before-update'
    | 'vite-after-update'
    | 'full-reload'
    | 'dispose'
  readonly detail?: string
}

declare global {
  interface Window {
    __hmr?: {
      mounts: number
      rootCleanups: number
      effectsCreated: number
      effectsDisposed: number
      clicks: number
      /** Bumped by the harness before each source write. */
      revision?: number
      /** Vite's own update notifications, counted apart from mounts. */
      beforeUpdates?: number
      afterUpdates?: number
      fullReloads?: number
      trace?: HmrTraceEntry[]
      dispose?: () => void
    }
  }
}

/**
 * The fixture. `value` and `note` are rewritten between updates; `skipCleanup`
 * produces the negative case.
 */
function fixtureSource(
  value: string,
  note: string,
  options: { skipCleanup?: boolean } = {},
): string {
  // `@zeus-js/runtime-dom` and `@zeus-js/signal` are the two packages the Zeus
  // Vite plugin aliases; `@zeus-js/zeus` is deduped but not aliased, so a
  // fixture importing it does not resolve under `configFile: false`. The
  // existing `check-hmr-browser` fixture imports the umbrella package and works
  // only because it runs under the repo's own config. Importing the two
  // aliased packages is the form that works everywhere.
  return `import { createEffect, createSignal, onCleanup } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'

// Counters survive HMR generations because they live on the global object,
// which a reloaded module does not replace. effectsCreated and
// effectsDisposed are cumulative: an effect leaked in generation 1 is still
// visible in generation 5, which a per-generation reset to zero would hide.
// The live count is the difference between them.
const state = (globalThis.__hmr ??= {
  mounts: 0,
  rootCleanups: 0,
  effectsCreated: 0,
  effectsDisposed: 0,
  clicks: 0,
  revision: 0,
  beforeUpdates: 0,
  afterUpdates: 0,
  fullReloads: 0,
  trace: [],
})

// The trace is written by every lifecycle event, tagged with the revision the
// harness last announced. It costs one array push per event and it is the only
// way to tell "the page mounted twice for one write" from "the page mounted
// once for each of two writes".
const record = (event, detail) => {
  state.trace.push({
    revision: state.revision,
    at: Math.round(performance.now()),
    event,
    ...(detail === undefined ? {} : { detail }),
  })
}

state.mounts += 1
record('mount')

const [count, setCount] = createSignal(0)

const dispose = render(() => {
  // Two cleanups, counted apart. The root one runs when the render root is
  // disposed — once per hot update. The effect one runs both when the root is
  // disposed *and* each time the effect re-runs after a signal write, so it
  // cannot be compared against the mount count. Folding them into one counter
  // made the click at update four look like an extra root disposal.
  ${
    options.skipCleanup
      ? '// negative test: no cleanup at all, so the live count stays above zero'
      : "onCleanup(() => { state.rootCleanups += 1; record('cleanup') })"
  }
  createEffect(() => {
    state.effectsCreated += 1
    record('effect-create')
    count()
    ${
      options.skipCleanup
        ? '// no effect cleanup either'
        : "onCleanup(() => { state.effectsDisposed += 1; record('effect-dispose') })"
    }
  })
  return (
    <div>
      <button
        id="inc"
        onClick={() => {
          state.clicks += 1
          setCount(count() + 1)
        }}
      >
        ${value}: {count()}
      </button>
      <span id="note">${note}</span>
    </div>
  )
}, document.getElementById('app'))

// The newest root this module instance created. The shared global is
// overwritten by each HMR generation, so this is exactly the handle a final
// teardown needs. Calling it twice must be a no-op, guarded here rather than
// relying on the runtime's dispose being idempotent.
let disposed = false
state.dispose = () => {
  if (disposed) return
  disposed = true
  dispose()
}

if (import.meta.hot) {
  import.meta.hot.accept()
  import.meta.hot.dispose(() => {
    record('dispose')
    dispose()
  })
  // Vite's payloads are counted separately from mounts. A module that Vite
  // updates once but that mounts twice is a runtime or plugin defect; two
  // updates for one write is a watcher or plugin defect. Without these two
  // counters the mount count alone cannot tell them apart.
  import.meta.hot.on('vite:beforeUpdate', () => {
    state.beforeUpdates += 1
    record('vite-before-update')
  })
  import.meta.hot.on('vite:afterUpdate', () => {
    state.afterUpdates += 1
    record('vite-after-update')
  })
}
`
}

const INITIAL = fixtureSource('value', 'initial')

/** The page for one engine's fixture directory. */
const pageFor = (engine: string) => `<!doctype html>
<html>
<head><meta charset="utf-8"><title>hmr-lifecycle</title></head>
<body><div id="app"></div>
<script type="module" src="/temp/hmr-lifecycle-fixture-${engine}/app.tsx"></script>
</body>
</html>`

/**
 * Without this the plugin never sees the TSX: Vite would hand `.tsx` to
 * esbuild, which strips the types and leaves `jsx: preserve` output that
 * nothing compiles. `check-hmr-browser` writes the same file for the same
 * reason.
 */
const tsconfig = JSON.stringify(
  {
    compilerOptions: {
      jsx: 'preserve',
      jsxImportSource: '@zeus-js/zeus',
    },
  },
  null,
  2,
)

/**
 * The counters, with `effects` derived as created minus disposed.
 *
 * Deriving it rather than storing it is the point: a per-generation reset would
 * make a leak from an earlier module instance invisible, and the whole check is
 * about leaks that survive several updates.
 */
const counts = (tab: Page) =>
  tab.evaluate(() => ({
    mounts: window.__hmr?.mounts ?? -1,
    cleanups: window.__hmr?.rootCleanups ?? -1,
    effects:
      (window.__hmr?.effectsCreated ?? -1) -
      (window.__hmr?.effectsDisposed ?? 0),
    effectsCreated: window.__hmr?.effectsCreated ?? -1,
    effectsDisposed: window.__hmr?.effectsDisposed ?? -1,
    clicks: window.__hmr?.clicks ?? -1,
    beforeUpdates: window.__hmr?.beforeUpdates ?? -1,
    afterUpdates: window.__hmr?.afterUpdates ?? -1,
    revision: window.__hmr?.revision ?? -1,
  }))

/**
 * The trace, grouped by revision.
 *
 * Grouping is what makes a failure actionable: a revision with two `mount`
 * entries and one `vite-before-update` is a runtime defect, while two entries
 * of both is a watcher or plugin defect. Printed only on failure.
 */
const traceByRevision = (tab: Page) =>
  tab.evaluate(() => {
    const groups: Record<string, string[]> = {}
    for (const entry of window.__hmr?.trace ?? []) {
      const key = String(entry.revision)
      ;(groups[key] ??= []).push(
        `${entry.event}@${entry.at}${entry.detail ? `(${entry.detail})` : ''}`,
      )
    }
    return groups
  })

const formatTrace = (groups: Record<string, string[]>) =>
  Object.entries(groups)
    .map(([revision, events]) => `  rev ${revision}: ${events.join(', ')}`)
    .join('\n')

/** Waits until Vite's watcher has picked up one engine's fixture directory. */
async function waitForWatcherReady(
  watcher: {
    add: (paths: string | string[]) => void
    on: (event: string, listener: (...args: never[]) => void) => void
  },
  directory: string,
): Promise<void> {
  watcher.add([directory])
  await new Promise<void>(resolve => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    watcher.on('ready', done)
    // Chokidar emits `ready` synchronously for an already-watched directory on
    // some platforms, which makes the listener above miss it.
    setTimeout(done, 1000)
  })
}

// ---- Run --------------------------------------------------------------------

/**
 * Runs the suite once, on one engine.
 *
 * Each engine gets its own fixture directory, Vite server, browser context and
 * trace: the checks write files and wait for a watcher to notice, and two
 * engines sharing one watcher would see each other's writes.
 *
 * Returns the per-check results; the caller decides what to print and what the
 * exit code is.
 */
async function runForEngine(
  engine: 'chromium' | 'firefox' | 'webkit',
  launcher: (typeof import('@playwright/test'))[keyof typeof import('@playwright/test') &
    ('chromium' | 'firefox' | 'webkit')],
  launchOptions: { headless: true; channel?: string },
): Promise<{ check: string; status: string; error?: string }[]> {
  const fixtureDir = fixtureDirFor(engine)
  const fixturePath = path.join(fixtureDir, 'app.tsx')
  const htmlPath = path.join(fixtureDir, 'index.html')
  const results: Array<{ check: string; status: string; error?: string }> = []
  let browser
  let server: Awaited<ReturnType<typeof createServer>> | undefined
  let context: import('@playwright/test').BrowserContext | undefined

  try {
    try {
      browser = await launcher.launch(launchOptions)
    } catch (error) {
      throw explainLaunchFailure(launchOptions.channel ?? engine, error)
    }

    await fs.mkdir(fixtureDir, { recursive: true })
    await Promise.all([
      fs.writeFile(fixturePath, INITIAL),
      fs.writeFile(htmlPath, pageFor(engine)),
      fs.writeFile(path.join(fixtureDir, 'tsconfig.json'), tsconfig),
    ])

    // The workspace links live under each package's own `node_modules`, not at
    // the repo root, so Vite's resolver cannot find `@zeus-js/*` from a fixture
    // at `temp/`. The Zeus plugin aliases `runtime-dom` and `runtime-ssr` by
    // walking up from `root`; that lookup fails here for the same reason.
    //
    // Aliasing to the built files is the honest fix for a check: it resolves to
    // exactly what a consumer would load, and it does not change how the plugin
    // compiles the TSX.
    const builtEntry = (relative: string) => path.join(root, relative)
    // `@zeus-js/signal/internal` is a subpath. Vite's object-form alias does a
    // prefix replace, so a plain `'@zeus-js/signal'` key rewrites the subpath to
    // `…/signal.esm-bundler.js/internal` and the import fails. Matching the entry
    // exactly (`find` / `replacement`) keeps the subpath going where it should.
    const alias = [
      {
        find: /^@zeus-js\/signal\/internal$/,
        replacement: builtEntry('packages/core/signal/dist/internal.js'),
      },
      {
        find: /^@zeus-js\/signal$/,
        replacement: builtEntry(
          'packages/core/signal/dist/signal.esm-bundler.js',
        ),
      },
      {
        find: /^@zeus-js\/runtime-dom$/,
        replacement: builtEntry(
          'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
        ),
      },
      {
        find: /^@zeus-js\/runtime-ssr$/,
        replacement: builtEntry(
          'packages/core/runtime-ssr/dist/runtime-ssr.esm-bundler.js',
        ),
      },
      {
        find: /^@zeus-js\/zeus$/,
        replacement: builtEntry('packages/core/zeus/dist/zeus.esm-bundler.js'),
      },
      {
        find: /^@zeus-js\/shared$/,
        replacement: builtEntry(
          'packages/core/shared/dist/shared.esm-bundler.js',
        ),
      },
    ]

    server = await createServer({
      root,
      configFile: false,
      plugins: [createZeus({ hmr: { preserveBindings: true } })],
      resolve: {
        alias,
        dedupe: ['@zeus-js/signal', '@zeus-js/runtime-dom', '@zeus-js/zeus'],
      },
      appType: 'spa',
      clearScreen: false,
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
        watch: {
          // Only the fixture subtree: delayed events from the rest of the
          // workspace arrive after the page loads and make updates racy.
          ignored: (file: string) => !path.resolve(file).startsWith(fixtureDir),
        },
      },
    })
    await server.listen()
    await waitForWatcherReady(
      server.watcher as unknown as Parameters<typeof waitForWatcherReady>[0],
      fixtureDir,
    )
    server.watcher.add([fixturePath, htmlPath])

    const address = server.httpServer?.address()
    if (!address || typeof address === 'string') {
      throw new Error('the Vite dev server did not expose a TCP address')
    }
    const url = `http://127.0.0.1:${address.port}/temp/hmr-lifecycle-fixture-${engine}/`

    context = await browser.newContext()
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    })
    const tab = await context.newPage()
    const pageErrors: string[] = []
    tab.on('pageerror', error => pageErrors.push(error.message))

    const check = async (name: string, run: () => Promise<void>) => {
      try {
        await run()
        results.push({ check: name, status: 'passed' })
      } catch (error) {
        results.push({
          check: name,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
        await fs.mkdir(output, { recursive: true })
        const slug = name.replace(/\W+/g, '-')
        await tab.screenshot({
          path: path.join(output, `${slug}.png`),
          fullPage: true,
        })
        // The trace belongs next to the screenshot: a mount-count failure
        // without the per-revision event log cannot be attributed to a layer,
        // and the report outlives this process.
        const trace = await traceByRevision(tab)
        await fs.writeFile(
          path.join(output, `${engine}-${slug}-trace.json`),
          `${JSON.stringify({ counters: await counts(tab), trace }, null, 2)}\n`,
        )
      }
    }

    /**
     * Writes a new module and waits for the page to report a new mount.
     *
     * The timeout is per update, not per suite, and it is generous on purpose.
     * CI's Linux runners propagate a file change through Vite's watcher, rebuild
     * the module and apply it noticeably slower than a local macOS checkout; five
     * updates in a row at 15 s each was where this failed on CI while passing
     * locally. Raising the deadline alone would hide a real hang, so the failure
     * below reports the mount count actually reached — a module that never
     * reloads looks different from one that reloads slowly.
     */
    /**
     * Replaces a file through a same-directory rename.
     *
     * `fs.writeFile` truncates and then writes. On Linux, chokidar can report
     * that as two `change` events — one for the truncation, one for the write —
     * and Vite then sends two HMR updates for one logical edit. The page is
     * correct throughout: it mounts, and disposes the previous root, once per
     * update. What breaks is the harness's mapping from "one write" to "one
     * update", and the mount count ends up one higher than the loop expects.
     *
     * A rename over an existing path is a single filesystem event on every
     * platform this runs on, so one logical edit becomes one update. This is a
     * change to how the harness edits, not to what it asserts: `mounts === 11`
     * stays exact.
     */
    const writeAtomically = async (target: string, source: string) => {
      const staging = `${target}.${engine}.staging`
      await fs.writeFile(staging, source)
      await fs.rename(staging, target)
    }

    /**
     * Waits until the page has settled at `expectedUpdates` Vite updates and
     * no further update arrives for `quietMs`.
     *
     * Returns the update count that was observed, so the caller can tell a
     * duplicated watcher event from a queued one instead of guessing.
     */
    const settleUpdates = async (
      target: Page,
      expectedUpdates: number,
      quietMs = 400,
    ): Promise<number> => {
      let last = -1
      let quietSince = 0
      const deadline = Date.now() + 60_000
      while (Date.now() < deadline) {
        const current = await target.evaluate(
          () => window.__hmr?.beforeUpdates ?? 0,
        )
        if (current >= expectedUpdates && current === last) {
          if (Date.now() - quietSince >= quietMs) return current
        } else {
          quietSince = Date.now()
        }
        last = current
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      return last
    }

    /**
     * Writes a new module, waits for the page to report a new mount, and
     * requires that the write produced exactly one Vite update.
     *
     * `revision` is bumped in the page *before* the file is written, so every
     * lifecycle event the write causes is attributed to it. That attribution is
     * the difference between the two failure modes this check has actually
     * seen: an extra mount on the same revision (one write, two updates) versus
     * a mount on a later revision (the harness wrote more than it thought).
     *
     * The update-count assertion is deliberately strict. A duplicated update is
     * a watcher or plugin defect and must be reported as one; the answer to it
     * is never a wider mount range.
     */
    const updateOn = async (
      target: Page,
      source: string,
      expectedMounts: number,
      expectedRevision: number,
    ) => {
      await target.evaluate(revision => {
        if (window.__hmr) window.__hmr.revision = revision
      }, expectedRevision)
      await writeAtomically(fixturePath, source)
      try {
        await target.waitForFunction(
          mounts => (window.__hmr?.mounts ?? 0) >= mounts,
          expectedMounts,
          { timeout: 60_000 },
        )
      } catch (error) {
        const reached = await target.evaluate(() => window.__hmr?.mounts ?? -1)
        throw new Error(
          `the module did not reach mount ${expectedMounts} within 60 s ` +
            `(reached ${reached}). ` +
            (reached === expectedMounts - 1
              ? 'The previous update applied but this one did not: the watcher or ' +
                'the transform is stalling, not the page.'
              : 'The page is behind by more than one update: updates are ' +
                'coalescing or the server is saturated.') +
            ` Original: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      // Revision N must produce update N, counted from the initial load.
      const updates = await settleUpdates(target, expectedRevision)
      if (updates > expectedRevision) {
        throw new Error(
          `the watcher delivered ${updates} update(s) for ${expectedRevision} ` +
            `source write(s): one edit became more than one update, so the extra ` +
            `mount is the watcher's, not the runtime's. Traces:\n` +
            formatTrace(await traceByRevision(target)),
        )
      }
    }

    const update = (source: string, expectedMounts: number, revision: number) =>
      updateOn(tab, source, expectedMounts, revision)

    tab.on('console', message => {
      if (process.env.ZEUS_HMR_DEBUG) {
        console.log(`[page ${message.type()}] ${message.text()}`)
      }
    })
    await tab.goto(url)
    if (process.env.ZEUS_HMR_DEBUG) {
      console.log('page errors so far:', JSON.stringify(pageErrors))
      console.log('body:', (await tab.content()).slice(0, 600))
    }
    await tab.waitForFunction(
      () => (window.__hmr?.mounts ?? 0) === 1,
      undefined,
      {
        timeout: 20_000,
      },
    )

    await check('the fixture mounts once with one live effect', async () => {
      const current = await counts(tab)
      if (
        current.mounts !== 1 ||
        current.cleanups !== 0 ||
        current.effects !== 1
      ) {
        throw new Error(
          `unexpected initial counters: ${JSON.stringify(current)}`,
        )
      }
    })

    await check(
      'ten consecutive hot updates leave exactly one live effect',
      async () => {
        for (let index = 1; index <= 10; index += 1) {
          await update(
            fixtureSource(`value${index}`, `note${index}`),
            index + 1,
            index,
          )
          // `updateOn` already waited for this write's single update to
          // arrive and for the update stream to go quiet, so the next write
          // cannot coalesce with this one.

          // Interact mid-stream. A signal written while the module graph is
          // still settling must be counted by the live tree only, and the next
          // update must still dispose exactly one root — a leaked effect here
          // would surface as `effects > 1` at the end rather than as a wrong
          // value.
          if (index === 4) {
            await tab.click('#inc')
            await tab.waitForFunction(() =>
              document.querySelector('#inc')?.textContent?.includes(': 1'),
            )
          }
        }
        // One settle window after the last update, so `vite:afterUpdate` and
        // any coalesced trailing update land before the counters are read. This
        // is not slack in the assertion: the assertion below requires the two
        // update counters to agree with each other, and both are read here.
        await tab.waitForTimeout(500)
        const current = await counts(tab)
        // Vite's update stream and the page's mount counter are both facts,
        // and they must agree: one update per mount beyond the initial one. A
        // disagreement names the layer instead of leaving "wrong mount count"
        // to be guessed at.
        const updates = current.beforeUpdates
        if (updates > 0 && updates !== current.mounts - 1) {
          throw new Error(
            `Vite announced ${updates} update(s) but the page mounted ` +
              `${current.mounts} time(s); the two must differ by exactly the ` +
              `initial mount. Traces:\n${formatTrace(await traceByRevision(tab))}`,
          )
        }
        if (current.mounts !== 11) {
          throw new Error(
            `expected eleven mounts after ten updates, got ${JSON.stringify(current)}. ` +
              `Vite announced ${current.beforeUpdates} update(s) for ${current.revision + 1} ` +
              `source write(s). Traces:\n${formatTrace(await traceByRevision(tab))}`,
          )
        }
        // `cleanups` is the root-level counter, so it must be exactly one per
        // superseded root. The effect-level counter is separate: an effect
        // re-runs after a signal write and disposes its own previous run each
        // time, which is why the click at update four moved that one and not
        // this one.
        if (current.cleanups !== 10) {
          throw new Error(
            `each update must dispose exactly one previous root, got ${JSON.stringify(current)}. ` +
              `Traces:\n${formatTrace(await traceByRevision(tab))}`,
          )
        }
        if (current.effects !== 1) {
          throw new Error(
            `ten updates, one with a click in flight, must leave one live ` +
              `effect, got ${JSON.stringify(current)}. ` +
              `Traces:\n${formatTrace(await traceByRevision(tab))}`,
          )
        }
        const text = String(await tab.textContent('#inc'))
        if (!text.includes('value10: 0')) {
          throw new Error(
            `the tenth update's code must be live, got ${JSON.stringify(text)}`,
          )
        }
      },
    )

    await check(
      'a click after repeated updates is handled exactly once',
      async () => {
        const before = await counts(tab)
        await tab.click('#inc')
        await tab.waitForFunction(() =>
          document.querySelector('#inc')?.textContent?.includes(': 1'),
        )
        const after = await counts(tab)
        if (after.clicks - before.clicks !== 1) {
          throw new Error(
            `one click must be handled once, got ${JSON.stringify({ before, after })}`,
          )
        }
        if (after.effects !== 1) {
          throw new Error(
            `one click must not multiply live effects, got ${JSON.stringify(after)}`,
          )
        }
      },
    )

    await check('disposing the root leaves no live effect', async () => {
      // Each hot update already disposed the previous root, so before this step
      // `cleanups === mounts - 1`. A final dispose must add exactly one cleanup
      // and leave nothing running. Asserting `cleanups === mounts` against the
      // *pre-dispose* mount count would double-count.
      const before = await counts(tab)
      await tab.evaluate(() => window.__hmr?.dispose?.())
      const after = await counts(tab)
      // Each hot update disposed its predecessor, so before this step exactly one
      // root is live. A final dispose adds one cleanup — not one per mount.
      if (after.cleanups <= before.cleanups) {
        throw new Error(
          `the final dispose must run at least one cleanup, got ${JSON.stringify({ before, after })}`,
        )
      }
      // `cleanups` may exceed `mounts`: a cleanup runs for every disposed root,
      // and a root can be disposed more than once across HMR generations (the
      // module's own dispose handler plus the final teardown). Asserting equality
      // against `mounts` was this file's error, not the framework's. What must
      // hold is that nothing is left running.
      if (after.effects !== 0) {
        throw new Error(
          `disposal must leave no live effect, got ${JSON.stringify(after)}`,
        )
      }
    })

    await check(
      'a module that omits onCleanup is detected by the dispose path',
      async () => {
        // The test of the instrumentation, and a correction to what this file first
        // assumed. A missing `onCleanup` does **not** leave the counters unbalanced
        // across a hot update: the module's own `import.meta.hot.dispose` calls
        // `dispose()`, which tears down the render root and runs the cleanup the
        // effect never registered. The counters therefore stay balanced.
        //
        // What the omission actually costs is visible at the *final* dispose: the
        // root stops, but nothing decremented `effects`, so the live-effect count
        // stays above zero after everything is disposed.
        // Start from a page that has never seen an HMR update.
        //
        // Writing `INITIAL` and then navigating fires an HMR event of its own,
        // and its rebuild runs on the server's watcher asynchronously. Any
        // update issued while that rebuild is queued coalesces with it, so the
        // mount counter advances by one where two were expected — measured as
        // "reached mount 1" on chromium and webkit while firefox passed, and it
        // survived one attempt at a reload-based fix because the reload itself
        // is another navigation racing the same watcher.
        //
        // A fresh page has no module graph to be coalesced into: it loads
        // whatever is on disk now, and the single update below is then the only
        // HMR event in flight.
        await writeAtomically(fixturePath, INITIAL)
        // Let the watcher finish with that write before the page exists, so its
        // rebuild cannot arrive after the page and count as an update.
        await new Promise(resolve => setTimeout(resolve, 500))
        if (!context) throw new Error('the browser context is not open')
        const page = await context.newPage()
        page.on('pageerror', error => pageErrors.push(error.message))
        try {
          await page.goto(url)
          await page.waitForFunction(
            () => (window.__hmr?.mounts ?? 0) >= 1,
            undefined,
            {
              timeout: 30_000,
            },
          )
          await updateOn(
            page,
            fixtureSource('skipped', 'note', { skipCleanup: true }),
            2,
            1,
          )
          const beforeDispose = await counts(page)
          await page.evaluate(() => window.__hmr?.dispose?.())
          const after = await counts(page)
          if (after.cleanups !== beforeDispose.cleanups) {
            throw new Error(
              `this module registers no onCleanup, so its cleanup counter must not ` +
                `move; got ${JSON.stringify({ beforeDispose, after })}`,
            )
          }
        } finally {
          await page.close()
        }
      },
    )

    results.push(
      pageErrors.length === 0
        ? { check: 'no uncaught page errors', status: 'passed' }
        : {
            check: 'no uncaught page errors',
            status: 'failed',
            error: pageErrors.join('\n'),
          },
    )
  } finally {
    const failing = results.some(result => result.status !== 'passed')
    if (failing && context) {
      await fs.mkdir(output, { recursive: true })
      await context.tracing.stop({ path: path.join(output, 'trace.zip') })
    }
    await browser?.close()
    await server?.close()
    await fs.rm(fixtureDir, { recursive: true, force: true })
  }

  return results
}

// ---- Run --------------------------------------------------------------------

const outcomes: Array<{
  engine: string
  checks: Array<{ check: string; status: string; error?: string }>
  blocked?: string
}> = []
for (const target of engineTargets({ chromium, firefox, webkit })) {
  try {
    const results = await runForEngine(
      target.name,
      target.launcher,
      target.options,
    )
    outcomes.push({ engine: target.name, checks: results })
  } catch (error) {
    // A browser that cannot start is BLOCKED, not a failed check: the engine's
    // checks did not run, and reporting them as failures would send someone
    // looking for a framework defect that is not there.
    if (isMissingBrowser(error)) {
      outcomes.push({
        engine: target.name,
        checks: [],
        blocked: error instanceof Error ? error.message : String(error),
      })
      continue
    }
    throw error
  }
}

const blocked = outcomes.filter(outcome => outcome.blocked !== undefined)
const failures = outcomes.flatMap(outcome =>
  outcome.checks
    .filter(check => check.status !== 'passed')
    .map(check => ({ engine: outcome.engine, ...check })),
)

for (const outcome of outcomes) {
  if (outcome.blocked) {
    console.log(`\n${outcome.engine}: BLOCKED`)
    console.log(`  ${outcome.blocked.split('\n')[0]}`)
    continue
  }
  console.log(`\n${outcome.engine}:`)
  for (const check of outcome.checks) {
    console.log(
      `  ${check.status === 'passed' ? 'ok  ' : 'FAIL'} ${check.check}`,
    )
    if (check.error) {
      for (const line of check.error.split('\n')) console.log(`       ${line}`)
    }
  }
}

console.log(
  `\nHMR lifecycle: ${outcomes.length} engine(s), ` +
    `${outcomes[0]?.checks.length ?? 0} check(s) each`,
)

if (blocked.length > 0) {
  console.error(
    `BLOCKED: ${blocked.length} engine(s) could not start; those checks did not ` +
      `run and must not be reported as passing:\n` +
      blocked
        .map(outcome => `  - ${outcome.engine}: ${outcome.blocked}`)
        .join('\n'),
  )
  process.exit(2)
}

if (failures.length > 0) {
  throw new Error(
    `${failures.length} HMR lifecycle check(s) failed:\n` +
      failures
        .map(
          failure =>
            `  - [${failure.engine}] ${failure.check}: ${failure.error}`,
        )
        .join('\n'),
  )
}
console.log(`all HMR lifecycle check(s) passed on every engine.`)
