import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  checkContract,
  CONTRACT_SOURCE,
  REQUIRED_RESULT_FIELDS,
} from './check-vite-plugin-compiler-contract'

const root = path.resolve(import.meta.dirname, '../..')
const treePlugin = path.join(root, 'packages/tooling/vite-plugin')

/**
 * Builds a fake plugin directory whose compiler is a stub with the shape under
 * test.
 *
 * A stub rather than a real compiler because the assertions are about which
 * fields the check notices are missing, and installing two real compiler
 * versions to test that would make the test depend on the registry.
 */
function pluginWithStubCompiler(
  resultFields: readonly string[],
  resolveBehaviour: 'ok' | 'missing' = 'ok',
): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-contract-'))

  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'stub-plugin', version: '0.0.0', type: 'commonjs' }),
  )

  /*
   * `index.cjs` stands in for the plugin's entry: the check only needs it as a
   * resolution anchor, exactly as `native.ts` uses the real one.
   */
  fs.writeFileSync(path.join(directory, 'index.cjs'), "'use strict'\n")

  if (resolveBehaviour === 'missing') {
    /*
     * A bare empty directory does not isolate resolution.
     *
     * `createRequire` walks up from the stub to the filesystem root, and in this
     * repository that is only a few levels from the real
     * `@zeus-js/compiler-native` — so the stub resolved the tree's compiler and
     * the test passed locally while failing in CI, where the same walk found a
     * different install. The package.json below claims the scope and points at
     * a path that does not exist, which makes the resolution fail for the
     * reason the test is about rather than for an accident of layout.
     */
    fs.mkdirSync(
      path.join(directory, 'node_modules/@zeus-js/compiler-native'),
      { recursive: true },
    )
    fs.writeFileSync(
      path.join(
        directory,
        'node_modules/@zeus-js/compiler-native/package.json',
      ),
      JSON.stringify({
        name: '@zeus-js/compiler-native',
        version: '0.0.0',
        main: 'missing.js',
      }),
    )

    return directory
  }

  const compiler = path.join(directory, 'node_modules/@zeus-js/compiler-native')

  fs.mkdirSync(compiler, { recursive: true })
  fs.writeFileSync(
    path.join(compiler, 'package.json'),
    JSON.stringify({
      name: '@zeus-js/compiler-native',
      version: '9.9.9',
      main: 'index.js',
    }),
  )
  fs.writeFileSync(
    path.join(compiler, 'index.js'),
    `'use strict'\n` +
      `exports.transformModule = function () {\n` +
      `  return ${JSON.stringify(
        Object.fromEntries(
          resultFields.map(f => [
            f,
            f === 'code'
              ? 'x'
              : f === 'diagnostics'
                ? []
                : f === 'hmrPlan'
                  ? {
                      version: 1,
                      signature: 's',
                      bindings: [{ id: 1, kind: 'class', value: 'a' }],
                    }
                  : {},
          ]),
        ),
      )}\n` +
      `}\n`,
  )

  return directory
}

describe('the compiler contract check', () => {
  it('accepts a compiler that returns every field the plugin reads', () => {
    const result = checkContract(pluginWithStubCompiler(REQUIRED_RESULT_FIELDS))

    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.compilerVersion).toBe('9.9.9')
  })

  it('rejects an hmrPlan that is present but null', () => {
    /*
     * A compiler can return the key holding null for every input. That disables
     * the plugin's patch path exactly as a missing key does, and a
     * presence-only check would pass it.
     */
    const directory = pluginWithStubCompiler(REQUIRED_RESULT_FIELDS)
    const compiler = path.join(
      directory,
      'node_modules/@zeus-js/compiler-native',
    )

    fs.writeFileSync(
      path.join(compiler, 'index.js'),
      "'use strict'\nexports.transformModule = function () { return { code: 'x', map: {}, diagnostics: [], hmrPlan: null } }\n",
    )

    const result = checkContract(directory)

    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toMatch(/null hmrPlan/)
  })

  it('rejects an hmrPlan with no bindings', () => {
    const directory = pluginWithStubCompiler(REQUIRED_RESULT_FIELDS)
    const compiler = path.join(
      directory,
      'node_modules/@zeus-js/compiler-native',
    )

    fs.writeFileSync(
      path.join(compiler, 'index.js'),
      "'use strict'\nexports.transformModule = function () { return { code: 'x', map: {}, diagnostics: [], hmrPlan: { version: 1, signature: 's', bindings: [] } } }\n",
    )

    const result = checkContract(directory)

    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toMatch(/no bindings/)
  })

  it('reports the field a compiler omits, and names it', () => {
    /*
     * This is the real defect: 0.1.1-beta.20 returns code/map/diagnostics/
     * hydrationPlan and no hmrPlan. The plugin's guard turns that silence into
     * a full page reload, so nothing fails on its own.
     */
    const result = checkContract(
      pluginWithStubCompiler(['code', 'map', 'diagnostics', 'hydrationPlan']),
    )

    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toMatch(/"hmrPlan"/)
    expect(result.problems.join('\n')).toMatch(/silently fall back/)
  })

  it('fails when the plugin cannot resolve a compiler at all', () => {
    const result = checkContract(pluginWithStubCompiler([], 'missing'))

    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toMatch(
      /cannot resolve @zeus-js\/compiler-native/,
    )
  })

  it('reports a transform that throws rather than passing it', () => {
    const directory = pluginWithStubCompiler([])
    const compiler = path.join(
      directory,
      'node_modules/@zeus-js/compiler-native',
    )

    fs.writeFileSync(
      path.join(compiler, 'index.js'),
      "'use strict'\nexports.transformModule = function () { throw new Error('native binding missing') }\n",
    )

    const result = checkContract(directory)

    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toMatch(/native binding missing/)
  })

  it('resolves from the plugin, not from the repository root', () => {
    /*
     * The regression this guards: resolving from `process.cwd()` would find the
     * tree's 0.2.0-rc.5 and report a contract that no installed consumer has.
     * The stub plugin's compiler is 9.9.9, which exists nowhere else.
     */
    const result = checkContract(pluginWithStubCompiler(REQUIRED_RESULT_FIELDS))

    expect(result.compilerVersion).toBe('9.9.9')
    expect(result.compilerPath).toContain('zeus-contract-')
  })

  it('resolves through a symlinked plugin, as pnpm installs it', () => {
    /*
     * The check reported the ecosystem's Admin as "cannot resolve" before it
     * realpathed, while a real build of that tree loaded the compiler fine.
     * A symlink here reproduces the layout pnpm creates: the plugin is a link
     * and its dependency sits in the store beside it, not beside the link.
     */
    const real = pluginWithStubCompiler(REQUIRED_RESULT_FIELDS)

    const linkParent = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-link-'))
    const link = path.join(linkParent, 'vite-plugin')

    try {
      fs.symlinkSync(real, link, 'junction')
    } catch {
      // A platform without symlink support cannot exercise this; skip.
      return
    }

    const result = checkContract(link)

    expect(result.problems).toEqual([])
    expect(result.compilerVersion).toBe('9.9.9')
  })

  it('exercises bindings, events and a keyed list, so a regression is not a trivial compile', () => {
    expect(CONTRACT_SOURCE).toMatch(/createSignal/)
    expect(CONTRACT_SOURCE).toMatch(/onClick/)
    expect(CONTRACT_SOURCE).toMatch(/\.map\(/)
    expect(CONTRACT_SOURCE).toMatch(/key=/)
  })

  it('is shaped for HMR: a top-level render and a literal expression container', () => {
    /*
     * Both are preconditions inside the compiler, and neither is obvious:
     * `collect_hmr_info` returns nothing without a render call, and
     * `passes::hmr::prepare` returns None when it masked no string literal —
     * `class="a"` is a Static attribute and never reaches the rewrite, while
     * `class={'a'}` does. Get either wrong and the contract reports a null plan
     * for a perfectly good compiler.
     */
    expect(CONTRACT_SOURCE).toMatch(/^render\(/m)
    expect(CONTRACT_SOURCE).toMatch(/class=\{'/)
    expect(CONTRACT_SOURCE).not.toMatch(/ class="/)
  })
})

describe('the tree plugin against the tree compiler', () => {
  it('satisfies the contract, which is what a Core release would publish', () => {
    /*
     * The tree pairs the plugin with `workspace:*`, resolved to the compiler in
     * the same tree. If this fails, the release would publish a plugin that
     * cannot do what the plugin's own HMR path assumes.
     */
    const result = checkContract(treePlugin)

    expect(
      result.problems,
      `compiler ${result.compilerVersion} at ${result.compilerPath} returned ${result.returned.join(', ')}`,
    ).toEqual([])
  })

  it('is caught by the packaged check when the plugin is packed', () => {
    /*
     * End to end through the CLI entry point, so the `if (import.meta...)`
     * guard and the exit code are covered too — a check that only works when
     * imported is not a check CI runs.
     */
    const script = path.join(
      root,
      'scripts/check/check-vite-plugin-compiler-contract.ts',
    )

    const output = execFileSync(
      'pnpm',
      ['exec', 'tsx', script, '--plugin-dir', treePlugin],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    expect(output).toMatch(/contract holds/)
  })
})
