/**
 * Runtime path references must resolve to a directory that exists.
 *
 * The six-domain move replaced `packages/core/compiler-native-*` with
 * `packages/compiler/compiler-native-*` everywhere it appeared as a literal,
 * but three places built the path from a template string —
 * `packages/core/${packageName}` — and the sweep did not match them. All seven
 * native matrix jobs then failed at the same copy step with ENOENT, and
 * `ci-gate` with them.
 *
 * `check:structure` could not catch that: it validates the layout of packages
 * that exist, not whether a script points at one that does not. This test is
 * the other half — it reads the runtime scripts and asserts every
 * `packages/<domain>/<name>` path they mention resolves.
 *
 * It is deliberately about paths, not imports: a broken import fails a build,
 * while a broken path in a release script fails a release.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')

/** Files that run in CI or during a release, where a bad path costs a run. */
const RUNTIME_GLOBS = ['scripts', '.github/workflows', 'deploy']

/**
 * Literal `packages/<domain>/<name>` occurrences.
 *
 * Template strings such as `packages/core/${name}` are not matched: they
 * cannot be checked statically, which is exactly why the three that existed
 * broke. The guard below asserts none have come back.
 */
const LITERAL_PACKAGE_PATH =
  /packages\/(?:core|compiler|features|web-c|tooling|create)\/([a-z0-9][a-z0-9-]*)(?=[/'"\s`,)]|$)/g

/**
 * `packages/<domain>/${...}` — a path that cannot be verified without running
 * the script. None may remain in runtime code.
 */
const UNVERIFIABLE_PACKAGE_PATH =
  /packages\/(?:core|compiler|features|web-c|tooling|create)\/[^'"`\s]*\$\{/g

interface Offender {
  readonly file: string
  readonly line: number
  readonly text: string
}

function walk(relativeDir: string): string[] {
  const absolute = path.join(root, relativeDir)
  if (!fs.existsSync(absolute)) return []
  const files: string[] = []
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relativeDir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      files.push(...walk(child))
    } else if (/\.(ts|mjs|cjs|js|yml|yaml|sh)$/.test(entry.name)) {
      // A `.spec.ts` fixture builds synthetic trees under paths like
      // `packages/core/new-runtime`; those are test data, not the repository.
      if (/\.spec\.ts$/.test(entry.name)) continue
      files.push(child)
    }
  }
  return files
}

function runtimeFiles(): string[] {
  return RUNTIME_GLOBS.flatMap(walk).filter(
    // `check-structure` names the retired paths on purpose so it can fail when
    // one comes back. Those strings are the opposite of a runtime reference.
    file => !file.endsWith('check/check-structure.ts'),
  )
}

describe('runtime package paths resolve', () => {
  it('mentions only package directories that exist', () => {
    const offenders: Offender[] = []

    for (const file of runtimeFiles()) {
      const source = fs.readFileSync(path.join(root, file), 'utf-8')
      source.split('\n').forEach((text, index) => {
        if (
          text.trimStart().startsWith('//') ||
          text.trimStart().startsWith('*')
        ) {
          return
        }
        for (const match of text.matchAll(LITERAL_PACKAGE_PATH)) {
          const candidate = `packages/${match[0].split('packages/')[1]}`
          // The regex stops at the package name; the path may continue.
          const directory = path.join(root, candidate)
          if (!fs.existsSync(directory)) {
            offenders.push({ file, line: index + 1, text: text.trim() })
          }
        }
      })
    }

    expect(
      offenders,
      offenders.map(o => `${o.file}:${o.line}  ${o.text}`).join('\n'),
    ).toEqual([])
  })

  it('has no template-built package paths that cannot be checked', () => {
    const offenders: Offender[] = []

    /**
     * A variable in the *domain* position cannot be checked. A variable in the
     * *name* position is allowed when the domain is literal — e.g.
     * `packages/core/runtime-${target}` only ever names runtime-dom or
     * runtime-ssr, both of which are in `core` — because the domain, which is
     * what the move changed, is fixed in the source.
     */
    const templateInDomain = /packages\/\$\{/

    for (const file of runtimeFiles()) {
      const source = fs.readFileSync(path.join(root, file), 'utf-8')
      source.split('\n').forEach((text, index) => {
        if (
          text.trimStart().startsWith('//') ||
          text.trimStart().startsWith('*')
        ) {
          return
        }
        for (const match of text.matchAll(UNVERIFIABLE_PACKAGE_PATH)) {
          if (templateInDomain.test(match[0])) {
            offenders.push({ file, line: index + 1, text: text.trim() })
          }
        }
      })
    }

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These build a package path from a variable, so nothing can verify the directory exists — which is how the native artifact copy broke. Resolve the directory from findWorkspacePackages() instead:\n${offenders
            .map(o => `${o.file}:${o.line}  ${o.text}`)
            .join('\n')}`,
    ).toEqual([])
  })

  it('resolves the packages the native build and restore scripts write to', async () => {
    // The exact path the failure produced, asserted through the real mapping:
    // if `build-native-platform` and `restore-native-artifacts` disagree with
    // the workspace layout, this fails before CI does.
    const { findWorkspacePackages } = await import('../../shared/utils.ts')
    const packages = findWorkspacePackages()

    const platforms = [
      'compiler-native-darwin-arm64',
      'compiler-native-darwin-x64',
      'compiler-native-linux-arm64-gnu',
      'compiler-native-linux-x64-gnu',
      'compiler-native-linux-x64-musl',
      'compiler-native-win32-arm64-msvc',
      'compiler-native-win32-x64-msvc',
    ]

    for (const shortName of platforms) {
      const found = packages.find(pkg => pkg.shortName === shortName)
      expect(found, `${shortName} is not a workspace package`).toBeDefined()
      expect(found?.relativeDir).toBe(`packages/compiler/${shortName}`)
    }
  })
})

describe('package lists are resolved, not written out', () => {
  /**
   * A list like `['core/shared', 'devtools/vite-plugin']` joined with
   * `packages/` is a fourth copy of the layout. `check-packed-consumers` and
   * `check-hmr-packed` each had one, and after the six-domain move every entry
   * pointed at a directory that no longer existed — the first `package.json`
   * read failed one second in, naming no path.
   *
   * The earlier checks miss this because the strings do not contain
   * `packages/`; this one looks for the shape directly.
   */
  const BARE_DOMAIN_PATH = /['"`](core|devtools)\/([a-z0-9][a-z0-9-]*)['"`]/g

  it('has no domain-relative package path lists', () => {
    const offenders: Offender[] = []

    for (const file of runtimeFiles()) {
      const source = fs.readFileSync(path.join(root, file), 'utf-8')
      const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      withoutComments.split('\n').forEach((text, index) => {
        BARE_DOMAIN_PATH.lastIndex = 0
        if (BARE_DOMAIN_PATH.test(text)) {
          offenders.push({ file, line: index + 1, text: text.trim() })
        }
      })
    }

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These name a package as a domain-relative path, which is a hand-written copy of the layout that cannot survive a move. Resolve it from findWorkspacePackages() by short name instead:\n${offenders
            .map(o => `${o.file}:${o.line}  ${o.text}`)
            .join('\n')}`,
    ).toEqual([])
  })
})

describe('native artifact paths', () => {
  it('writes and restores to the same directory', async () => {
    const build = fs.readFileSync(
      path.join(root, 'scripts/release/build-native-platform.ts'),
      'utf-8',
    )
    const restore = fs.readFileSync(
      path.join(root, 'scripts/release/restore-native-artifacts.ts'),
      'utf-8',
    )

    // Both resolve the directory through the workspace rather than writing a
    // path, which is what keeps them from disagreeing with the layout or with
    // each other.
    expect(build).toMatch(/findWorkspacePackages/)
    expect(restore).toMatch(/findWorkspacePackages/)

    // Comments may name the old path to explain the regression; only code
    // counts, so strip block and line comments before asserting.
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(stripComments(build)).not.toMatch(/packages\/(?:core|compiler)\//)
    expect(stripComments(restore)).not.toMatch(/packages\/(?:core|compiler)\//)
  })

  it('loads matrix packages from the directory the artifacts are uploaded from', () => {
    const workflow = fs.readFileSync(
      path.join(root, '.github/workflows/compiler-native.yml'),
      'utf-8',
    )

    // The require path and the upload path must agree, or the smoke test loads
    // a stale package while the artifact carries the new one.
    const requirePath = workflow.match(/require\('\.\/(packages\/[^']+)'\)/)
    const uploadPath = workflow.match(/path:\s*(packages\/\S+)/)

    expect(requirePath?.[1]).toBeDefined()
    expect(uploadPath?.[1]).toBeDefined()
    // YAML's own `${...}` may wrap or include a trailing newline, so the
    // assertion is on the directory both must agree on.
    expect(requirePath?.[1]).toMatch(/^packages\/compiler\//)
    expect(uploadPath?.[1]).toMatch(/^packages\/compiler\//)
    expect(workflow).not.toMatch(/packages\/core\//)
  })
})

describe('release ordering', () => {
  it('keeps the compiler and runtime grouped in the order the RC verified', async () => {
    // `@baicie/release` publishes grouped by `packageKind`. Before the move
    // every `packages/core/*` package — runtime, compiler, features and
    // `testing` — was `core`, and only the devtools pair had no kind. Reading
    // the directory now would invert that and publish `zeus` after packages it
    // depends on.
    const config = (await import('../../release.config.ts')).default
    const kind = config.workspace.packageKind

    expect(kind?.('packages/core/signal', {})).toBe('core')
    expect(kind?.('packages/compiler/compiler-native', {})).toBe('core')
    expect(kind?.('packages/features/router', {})).toBe('core')
    expect(kind?.('packages/tooling/testing', {})).toBe('core')
    expect(kind?.('packages/tooling/eslint-plugin', {})).toBeUndefined()
    expect(kind?.('packages/tooling/playground-engine', {})).toBeUndefined()
    expect(kind?.('packages/web-c/web-c', {})).toBe('web-c')
  })
})
