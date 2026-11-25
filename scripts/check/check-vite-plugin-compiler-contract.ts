/**
 * The vite plugin and the compiler it loads must agree on what the compiler
 * can do — checked by asking the compiler, not by reading its version number.
 *
 * ## The defect this exists for
 *
 * `@zeus-js/vite-plugin@0.0.5` declares `@zeus-js/compiler-native@0.1.1-beta.20`
 * while the rest of the tree is on `0.2.0-rc.5`. The plugin is on its own
 * version line (`INDEPENDENT_PACKAGES`), so nothing forced it to be republished
 * when the compiler moved, and nothing noticed that it had not been.
 *
 * The consequence is not a version-number mismatch, it is a capability gap:
 * `transformModule({ hmr: true })` on `0.1.1-beta.20` returns
 * `code, map, diagnostics, hydrationPlan` — no `hmrPlan`. The plugin's HMR
 * patch path (`index.ts`, the `next.hmrPlan` comparison) therefore never runs
 * for any consumer on that version. `native.ts` declares `hmrPlan` in its
 * result type, so TypeScript reports nothing: the declaration describes the
 * tree the plugin is developed against, not the compiler a consumer installs.
 *
 * ## Why behaviour rather than a version comparison
 *
 * "The declared compiler equals the tree compiler" is not the contract. The
 * plugin may legitimately pin an older compiler if that compiler still satisfies
 * everything the plugin calls. What must hold is that the fields the plugin
 * reads are actually returned. A version-equality gate would also have to be
 * updated on every Core release that does not affect the plugin at all —
 * the noise that gets gates disabled.
 *
 * So this runs a representative transform through the compiler resolved *from
 * the plugin's own location* and asserts the response shape. That is the same
 * resolution `native.ts` performs at runtime, so the check sees what a consumer
 * sees.
 *
 * Usage:
 *   tsx scripts/check/check-vite-plugin-compiler-contract.ts [--plugin-dir <dir>]
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

/**
 * Fields the plugin reads off a transform result.
 *
 * `code` and `diagnostics` are load-bearing for every build; `map` is what the
 * plugin hands to Vite; `hmrPlan` gates the fine-grained HMR patch. A compiler
 * that omits one of these does not fail loudly — the plugin's guard is
 * `next.hmrPlan && ...`, which a missing field short-circuits into "reload the
 * page instead", so the degradation is silent by construction.
 */
export const REQUIRED_RESULT_FIELDS = [
  'code',
  'map',
  'diagnostics',
  'hmrPlan',
] as const

/**
 * The source the contract compiles.
 *
 * Two requirements decide this shape, both found by probing the compiler rather
 * than reading it:
 *
 * ## A top-level `render(...)`
 *
 * `collect_hmr_info` only records render calls when the module has one, so a
 * component-only module produces a null plan no matter what else it contains.
 *
 * The import source must be one of the two the compiler names literally
 * (`@zeus-js/runtime-dom` or `@zeus-js/zeus`). A bare `'zeus'` or a relative
 * path is not recorded as a render boundary even though the call is identical.
 *
 * ## A string literal in an expression container
 *
 * `passes::hmr::rewrite_expression` masks only expressions whose code parses as
 * a string literal, and `prepare` returns `None` when it found no slots. So
 * `class="a"` (a `Static` attribute in the IR) produces no plan, while
 * `class={'a'}` does. This is the whole reason a plan exists: a literal edited
 * between two compiles is what the signature is for.
 *
 * Verified against the tree compiler: `class={'a'}` yields
 * `HmrPlan { version: 1, bindings: 1 }`, the same module with `class="a"` yields
 * `null`.
 */
export const CONTRACT_SOURCE = `
import { createSignal, render } from '@zeus-js/zeus'

export function Contract() {
  const [count, setCount] = createSignal(0)
  return (
    <div class={'contract'}>
      <span>{count()}</span>
      <button onClick={() => setCount(c => c + 1)}>+</button>
      <ul>{[1, 2, 3].map(n => <li key={n}>{n * count()}</li>)}</ul>
    </div>
  )
}

render(() => <Contract />, document.body)
`

export interface ContractResult {
  readonly ok: boolean
  readonly problems: readonly string[]
  readonly compilerVersion: string
  readonly compilerPath: string
  readonly returned: readonly string[]
}

/**
 * Runs the contract against the compiler the plugin resolves.
 *
 * Resolution starts from the plugin's own directory because that is what
 * `native.ts` does — `createRequire(import.meta.url)` inside the plugin's
 * module. Resolving from the repository root would find the tree's compiler and
 * report a contract that no installed consumer has.
 */
export function checkContract(pluginDir: string): ContractResult {
  const problems: string[] = []

  let compilerPath = ''
  let compilerVersion = ''

  try {
    /*
     * pnpm installs `node_modules/@zeus-js/vite-plugin` as a symlink into its
     * content-addressed store, and the compiler lives beside it there rather
     * than beside the link. Resolving from the link path searches the consumer's
     * `node_modules`, finds nothing, and reports "cannot resolve" for an install
     * that works at runtime — Node realpaths modules by default, so the real
     * resolution starts inside the store.
     *
     * This was not hypothetical: the check reported the ecosystem's Admin as
     * unresolvable before this line existed, while a real build of that same
     * tree loaded the compiler fine.
     */
    const realPluginDir = fs.realpathSync(pluginDir)
    const requireFromPlugin = createRequire(
      path.join(realPluginDir, 'index.cjs'),
    )
    const entry = requireFromPlugin.resolve('@zeus-js/compiler-native')

    compilerPath = entry

    let directory = path.dirname(entry)

    while (!fs.existsSync(path.join(directory, 'package.json'))) {
      const parent = path.dirname(directory)

      if (parent === directory)
        throw new Error(`no package.json above ${entry}`)

      directory = parent
    }

    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
    ) as { version?: unknown }

    compilerVersion =
      typeof manifest.version === 'string' ? manifest.version : '(unknown)'
  } catch (error) {
    return {
      ok: false,
      problems: [
        `the plugin cannot resolve @zeus-js/compiler-native: ${error instanceof Error ? error.message : String(error)}`,
      ],
      compilerVersion,
      compilerPath,
      returned: [],
    }
  }

  let returned: string[] = []

  try {
    const requireFromCompiler = createRequire(compilerPath)
    const compiler = requireFromCompiler(compilerPath) as {
      transformModule(input: Record<string, unknown>): Record<string, unknown>
    }

    const result = compiler.transformModule({
      source: CONTRACT_SOURCE,
      filename: '/contract/contract.tsx',
      target: 'dom',
      runtimeModule: '@zeus-js/zeus',
      delegateEvents: true,
      sourceMap: true,
      hmr: true,
    })

    returned = Object.keys(result)

    for (const field of REQUIRED_RESULT_FIELDS) {
      if (!(field in result)) {
        problems.push(
          `transformModule({ hmr: true }) did not return "${field}"; the plugin reads it and would silently fall back`,
        )
      }
    }

    /*
     * Presence is not capability. The compiler that shipped this defect
     * returned no `hmrPlan` key at all, but a compiler could equally return the
     * key holding null for every input — which disables the same code path and
     * would pass a presence-only check. The contract source is built so a
     * working compiler must produce a plan from it.
     */
    if ('hmrPlan' in result && result.hmrPlan === null) {
      problems.push(
        'transformModule({ hmr: true }) returned a null hmrPlan for a module with a ' +
          'top-level render call and a string-literal binding; the plugin would never take its patch path',
      )
    }

    const plan = result.hmrPlan as {
      version?: unknown
      bindings?: unknown
    } | null

    if (plan && (!Array.isArray(plan.bindings) || plan.bindings.length === 0)) {
      problems.push(
        'the hmrPlan carries no bindings, so no edit could ever match its signature',
      )
    }

    const diagnostics = result.diagnostics as
      | Array<{ severity?: string }>
      | undefined

    if (Array.isArray(diagnostics)) {
      const errors = diagnostics.filter(entry => entry.severity === 'error')

      if (errors.length > 0) {
        problems.push(
          `the contract source failed to compile: ${errors.length} error(s)`,
        )
      }
    }
  } catch (error) {
    problems.push(
      `transformModule threw: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  return {
    ok: problems.length === 0,
    problems,
    compilerVersion,
    compilerPath,
    returned,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({
    options: { 'plugin-dir': { type: 'string' } },
    allowPositionals: true,
  })

  const pluginDir = path.resolve(
    values['plugin-dir'] ??
      path.join(process.cwd(), 'packages/tooling/vite-plugin'),
  )

  const result = checkContract(pluginDir)

  console.log(`compiler: ${result.compilerVersion}`)
  console.log(
    `resolved: ${path.relative(process.cwd(), result.compilerPath) || result.compilerPath}`,
  )
  console.log(`returned: ${result.returned.join(', ') || '(nothing)'}`)

  if (!result.ok) {
    for (const problem of result.problems) console.error(`\n  ${problem}`)

    console.error(
      '\nThe plugin and the compiler it loads disagree about the transform result.\n' +
        'Fix by releasing @zeus-js/vite-plugin against a compiler that returns these\n' +
        "fields, not by widening the consumer's lockfile.",
    )
    process.exit(1)
  }

  console.log('\nvite-plugin <-> compiler contract holds')
}
