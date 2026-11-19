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

/** Every workspace package manifest, excluding node_modules. */
function packageManifests(): string[] {
  const found: string[] = []
  const packagesDir = path.join(root, 'packages')
  for (const domain of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!domain.isDirectory()) continue
    const domainDir = path.join(packagesDir, domain.name)
    for (const pkg of fs.readdirSync(domainDir, { withFileTypes: true })) {
      if (!pkg.isDirectory() || pkg.name === 'node_modules') continue
      const manifest = path.join(domainDir, pkg.name, 'package.json')
      if (fs.existsSync(manifest)) found.push(manifest)
    }
  }
  return found
}

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

/**
 * Documents that state where a package lives.
 *
 * AGENTS.md is the first file an agent reads, so a path in it that no longer
 * exists sends the next session to a directory that was moved. That is not a
 * stale comment; it is a contract that is wrong. The compiler docs made the
 * same claim and drifted the same way after R16.0, which is why they are
 * checked rather than trusted.
 */
const CONTRACT_DOCS = [
  'AGENTS.md',
  'docs/architecture/packages.md',
  'docs/architecture/packages-migration-map.md',
  'docs/architecture/compiler/README.md',
  'docs/architecture/compiler/module-ownership.md',
  'docs/architecture/compiler/ir-contract.md',
  'docs/architecture/compiler/migration-report.md',
  'docs/architecture/compiler/current-pipeline.md',
  'docs/architecture/compiler/validation-matrix.md',
  'docs/api/packages.md',
]

describe('contract documents name real paths', () => {
  /**
   * A retired path may appear only where the document is describing history:
   * the retired-path list in `check-structure`, the migration map's old→new
   * table, and the R16 audit. Everywhere else it is a stale instruction.
   */
  const RETIRED =
    /packages\/(?:devtools\/|core\/(?:router|resource|query|i18n|testing|compiler))([a-z0-9-]*)/g

  /** Lines that are explicitly about the old layout. */
  const HISTORY_MARKERS = [
    'packages/core/router` |',
    '旧路径',
    '原有',
    '迁移前',
    'retired',
    'Retired',
    'was `',
    'were `',
    '旧目录',
  ]

  it('mentions no retired package path in a current-state sentence', () => {
    const offenders: Offender[] = []

    for (const file of CONTRACT_DOCS) {
      const absolute = path.join(root, file)
      if (!fs.existsSync(absolute)) continue
      const lines = fs.readFileSync(absolute, 'utf-8').split('\n')
      lines.forEach((text, index) => {
        RETIRED.lastIndex = 0
        if (!RETIRED.test(text)) return
        if (HISTORY_MARKERS.some(marker => text.includes(marker))) return
        // A markdown table row shaped `| old | new |` is the migration map.
        if (/^\s*\|.*\|.*\|\s*$/.test(text)) return
        offenders.push({ file, line: index + 1, text: text.trim() })
      })
    }

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These name a package directory that was moved. Update the path, or mark the line as historical:\n${offenders
            .map(o => `${o.file}:${o.line}  ${o.text}`)
            .join('\n')}`,
    ).toEqual([])
  })
})

describe('package metadata is internally consistent', () => {
  /**
   * `homepage` and `repository.directory` are two statements of the same fact.
   * The six-domain move updated the second and left the first pointing at the
   * old directory in five packages, so a reader following the npm page landed
   * on a 404. Deriving one from the other is the only version that cannot
   * drift.
   */
  it('derives homepage from repository.directory', () => {
    const offenders: string[] = []

    for (const manifestPath of packageManifests()) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
        name?: string
        homepage?: string
        repository?: { directory?: string }
      }
      const directory = manifest.repository?.directory
      const homepage = manifest.homepage
      if (!directory || !homepage) continue
      const expected = `https://github.com/baicie/zeus/tree/main/${directory}#readme`
      if (homepage !== expected) {
        offenders.push(
          `${manifest.name}: homepage is "${homepage}" but repository.directory is "${directory}"`,
        )
      }
    }

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `homepage must be derived from repository.directory:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  /**
   * A `.prettierignore` entry for a path that no longer exists is not harmless:
   * it means the file it was protecting is now being formatted, and the rule
   * reads as if it still protects something.
   */
  it('has no prettier or eslint ignore entry for a path that does not exist', () => {
    const ignoreFiles = ['.prettierignore']
    const offenders: string[] = []

    for (const file of ignoreFiles) {
      const absolute = path.join(root, file)
      if (!fs.existsSync(absolute)) continue
      const lines = fs.readFileSync(absolute, 'utf-8').split('\n')
      lines.forEach((raw, index) => {
        const entry = raw.trim()
        if (!entry || entry.startsWith('#')) return
        if (!entry.startsWith('packages/')) return
        if (entry.includes('*')) return
        if (!fs.existsSync(path.join(root, entry))) {
          offenders.push(`${file}:${index + 1}  ${entry}`)
        }
      })
    }

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These ignore entries name paths that do not exist:\n${offenders.join('\n')}`,
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
