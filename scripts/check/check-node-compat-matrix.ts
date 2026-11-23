/**
 * Which Node/npm combinations can actually install and run the packages (R24.1 TASK 14).
 *
 * Two failures have been confused with each other in this project, and the
 * confusion cost a day: an npm that drops the optional dependency group (so the
 * native binding never lands) and a package that is genuinely broken. They look
 * the same from a consumer's seat — `Cannot find native binding` — and they have
 * different owners.
 *
 * So this matrix reports, per Node/npm pair, whether the **install** worked and
 * separately whether the **framework** ran. A row where the install failed is
 * about npm; a row where the install succeeded and rendering failed is about
 * Zeus. Reporting one number would let either hide behind the other.
 *
 * ## What it does per row
 *
 * In an empty directory, with that Node's own npm:
 *
 *   1. install `@zeus-js/zeus` and `@zeus-js/runtime-ssr` from the candidate
 *      tarballs, plus this machine's platform package;
 * Recorded per row, because they answer different questions.
 *
 * ## What the first column actually measures here
 *
 * All four combinations report `ETARGET` for the umbrella install, and that is
 * a property of the candidate mechanism rather than of npm: `@zeus-js/zeus`'s
 * `dependencies` name `0.2.0-rc.3` from the registry, and a registry with only
 * tarballs cannot satisfy that. The npm-major difference R22 measured needs a
 * registry that holds *some* of the group, which is why the isolated-registry
 * drill is the right place to study it and this matrix is not.
 *
 * The useful column here is the second one: with every package named, all four
 * combinations install and render, so no Node or npm version in this set is
 * excluded by the framework itself.
 *
 * ## Which combinations
 *
 * The versions this repository declares support for (`engines`) plus the ones
 * on this machine. The interesting column is npm, not Node: Node 22.18 ships
 * npm 10.9.3, and `engines` allows it, so "supported Node version" and
 * "supported npm behaviour" are not the same claim.
 *
 * ```text
 * pnpm check:node-compat-matrix
 * ```
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const requireFromHere = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/node-compat-matrix')
const candidatesFile = path.join(
  root,
  'temp/create-zeus-candidate/candidates.json',
)

interface CandidateArchive {
  readonly name: string
  readonly version: string
  readonly file: string
}
interface Candidates {
  readonly schema: string
  readonly coreVersion: string
  readonly packages: readonly CandidateArchive[]
}

if (!fs.existsSync(candidatesFile)) {
  throw new Error(
    `${candidatesFile} is missing. Run \`pnpm check:create-zeus-candidate:prepare\` first.`,
  )
}
const candidates = JSON.parse(
  fs.readFileSync(candidatesFile, 'utf8'),
) as Candidates

const PLATFORM_PACKAGE = `@zeus-js/compiler-native-${platformPackage()}`
const NEEDED = [
  '@zeus-js/shared',
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/runtime-ssr',
  '@zeus-js/zeus',
  '@zeus-js/compiler',
  '@zeus-js/compiler-native',
  PLATFORM_PACKAGE,
] as const

const archives = new Map(candidates.packages.map(entry => [entry.name, entry]))

interface Row {
  readonly node: string
  readonly npm: string
  /**
   * What `@zeus-js/zeus` alone installs: does npm's `optionalDependencies`
   * handling place the platform package, or drop it?
   */
  readonly optionalDependencies: 'ok' | 'missing-platform' | 'failed'
  /** Whether npm placed every package when the platform package was named. */
  readonly install: 'ok' | 'missing-platform' | 'failed'
  /** Whether the framework rendered once installed. */
  readonly render: 'ok' | 'failed' | 'not-reached'
  readonly detail: string
  readonly optionalDetail?: string
  readonly installed?: readonly string[]
}

const rows: Row[] = []
fs.mkdirSync(output, { recursive: true })

/** Node binaries this machine has, from nvm, newest first. */
function nodeCandidates(): string[] {
  const nvm = path.join(os.homedir(), '.nvm/versions/node')
  const found: string[] = []
  if (fs.existsSync(nvm)) {
    for (const version of fs.readdirSync(nvm)) {
      const binary = path.join(nvm, version, 'bin/node')
      if (fs.existsSync(binary)) found.push(binary)
    }
  }
  found.push(process.execPath)
  return [...new Set(found)].sort().reverse()
}

for (const nodeBinary of nodeCandidates()) {
  const nodeVersion = execFileSync(nodeBinary, ['--version'], {
    encoding: 'utf8',
  }).trim()
  const binDir = path.dirname(nodeBinary)
  // That Node's own npm, not whichever npm happens to be on PATH: the pairing
  // is the thing under test.
  let npmVersion: string
  try {
    npmVersion = execFileSync(path.join(binDir, 'npm'), ['--version'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
    }).trim()
  } catch {
    rows.push({
      node: nodeVersion,
      npm: 'unavailable',
      optionalDependencies: 'failed',
      install: 'failed',
      render: 'not-reached',
      detail: 'this Node has no bundled npm to test with',
    })
    continue
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-node-compat-'))
  const project = path.join(work, 'app')
  fs.mkdirSync(project, { recursive: true })
  fs.writeFileSync(
    path.join(project, 'package.json'),
    `${JSON.stringify({ name: 'compat-probe', private: true, type: 'module' }, null, 2)}\n`,
  )

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: 'true',
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    npm_config_cache: path.join(output, 'npm-cache'),
  }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH

  const row: Row = {
    node: nodeVersion,
    npm: npmVersion,
    optionalDependencies: 'failed',
    install: 'failed',
    render: 'not-reached',
    detail: '',
  }

  // Phase 1: what a consumer gets from the umbrella package alone. The platform
  // package is left to `optionalDependencies`, which is precisely the path that
  // differs between npm majors.
  let optionalInstall = 'ok'
  let optionalDetail = ''
  try {
    execFileSync(
      path.join(binDir, 'npm'),
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        ...['@zeus-js/zeus', '@zeus-js/runtime-ssr', '@zeus-js/compiler'].map(
          name => `file:${archives.get(name)!.file}`,
        ),
      ],
      { cwd: project, env, stdio: 'pipe' },
    )
  } catch (error) {
    const text =
      (error as { stderr?: Buffer | string }).stderr?.toString() ??
      (error instanceof Error ? error.message : String(error))
    optionalInstall = 'failed'
    // Quote the line that names the cause, skipping npm's warning noise.
    optionalDetail =
      text
        .split('\n')
        .find(line => /npm error/.test(line))
        ?.trim() ??
      text.split('\n')[0] ??
      ''
  }
  // Whether the platform package landed is the answer, not whether npm printed
  // something. The first version treated any stderr line as a failure and
  // reported npm 11 as broken because it warns about an unrelated config key.
  const optionalLanded = fs.existsSync(
    path.join(project, 'node_modules', PLATFORM_PACKAGE),
  )
  if (optionalInstall === 'ok' && !optionalLanded) {
    optionalInstall = 'missing-platform'
    optionalDetail = `npm ${npmVersion} installed @zeus-js/zeus but not ${PLATFORM_PACKAGE}, which the wrapper needs`
  }

  try {
    execFileSync(
      path.join(binDir, 'npm'),
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        ...NEEDED.map(name => `file:${archives.get(name)!.file}`),
      ],
      { cwd: project, env, stdio: 'pipe' },
    )
  } catch (error) {
    const text =
      (error as { stderr?: Buffer | string }).stderr?.toString() ??
      (error instanceof Error ? error.message : String(error))
    rows.push({
      ...row,
      install: 'failed',
      detail:
        text.split('\n').find(line => /npm error/.test(line)) ??
        text.slice(0, 120),
    })
    fs.rmSync(work, { recursive: true, force: true })
    continue
  }

  const installed = fs
    .readdirSync(path.join(project, 'node_modules/@zeus-js'))
    .sort()
  const missing = NEEDED.map(name => name.replace('@zeus-js/', '')).filter(
    short => !installed.includes(short),
  )

  if (missing.length > 0) {
    // The install "succeeded" but npm dropped packages. That is the npm
    // behaviour this matrix exists to record — and it must never be reported
    // as a Zeus failure.
    rows.push({
      ...row,
      optionalDependencies: optionalInstall as Row['optionalDependencies'],
      optionalDetail,
      install: 'missing-platform',
      render: 'not-reached',
      detail: `npm ${npmVersion} installed ${installed.length} package(s) and omitted ${missing.join(', ')}`,
      installed,
    })
    fs.rmSync(work, { recursive: true, force: true })
    continue
  }

  // Render in this Node. Reaching here means the install was complete, so a
  // failure now is the framework's.
  const probe = path.join(project, 'probe.mjs')
  fs.writeFileSync(
    probe,
    // The probe renders through the SSR runtime's own entry points and checks
    // that the compiler package loads with it. It does not build DOM nodes:
    // there is no document in this process, which is the point.
    `import { ssrText, ssrStatic, ssrHydrationMarker } from '@zeus-js/runtime-ssr'
import { renderToString } from '@zeus-js/runtime-ssr'
import { createSignal } from '@zeus-js/signal'
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const compiler = require_('@zeus-js/compiler')
const compiled = compiler.transformModule({
  source: "export function App() { return <div id='x'>hi</div> }",
  filename: 'probe.tsx', target: 'ssr', runtimeModule: '@zeus-js/runtime-ssr',
  delegateEvents: false, sourceMap: false, hmr: false, autoHydrate: true,
})
if (compiled.diagnostics.length > 0) {
  console.error('compiler diagnostics', compiled.diagnostics)
  process.exit(1)
}
const [label] = createSignal('server')
const html = renderToString(() => [
  ssrHydrationMarker('c1.root'),
  ssrText(label()),
  ssrStatic('!'),
])
if (!String(html).includes('server')) {
  console.error('render produced no text', String(html))
  process.exit(1)
}
process.stdout.write(JSON.stringify({ html: String(html), diagnostics: compiled.diagnostics.length }))
`,
  )
  try {
    // The SSR runtime needs a document-like object for element rendering; this
    // probe renders text only, which is enough to prove the package loaded and
    // ran without adding a DOM implementation as a dependency.
    const rendered = execFileSync(nodeBinary, [probe], {
      cwd: project,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    rows.push({
      ...row,
      optionalDependencies: optionalInstall as Row['optionalDependencies'],
      optionalDetail,
      install: 'ok',
      render: 'ok',
      detail: `installed ${installed.length} packages; the compiler loaded and the runtime rendered`,
      installed,
    })
    void rendered
  } catch (error) {
    const text =
      (error as { stderr?: Buffer | string }).stderr?.toString() ??
      (error instanceof Error ? error.message : String(error))
    rows.push({
      ...row,
      optionalDependencies: optionalInstall as Row['optionalDependencies'],
      optionalDetail,
      install: 'ok',
      render: 'failed',
      detail: text.split('\n').slice(0, 2).join(' ').slice(0, 160),
      installed,
    })
  }
  fs.rmSync(work, { recursive: true, force: true })
}

for (const row of rows) {
  console.log(
    // `ok` describes the framework columns only. The umbrella column is
    // recorded, not judged: it fails for every row here because of the tarball
    // registry, and calling that "not ok" would imply the framework is not ok.
    `  ${row.install === 'ok' && row.render === 'ok' ? 'ok  ' : 'NOTE'} ` +
      `node ${row.node} / npm ${row.npm}: ` +
      `umbrella=${row.optionalDependencies} named=${row.install} render=${row.render}`,
  )
  if (row.optionalDependencies !== 'ok' && row.optionalDetail) {
    console.log(`       ${row.optionalDetail}`)
  }
  if (row.install !== 'ok' || row.render !== 'ok') {
    console.log(`       ${row.detail}`)
  }
}

fs.writeFileSync(
  path.join(output, 'report.json'),
  `${JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      coreVersion: candidates.coreVersion,
      note:
        'install and render are separate columns on purpose: a dropped optional ' +
        'dependency is an npm behaviour, a failed render after a complete ' +
        'install is a framework defect, and one number would let either hide ' +
        'behind the other.',
      rows,
    },
    null,
    2,
  )}\n`,
)

// A row that installed everything and then failed to render IS a framework
// defect and must fail the check. Rows where npm dropped packages are recorded,
// not failures — they are a property of the npm version, and the fix is a
// documented minimum, not a code change here.
const frameworkFailures = rows.filter(
  row => row.install === 'ok' && row.render !== 'ok',
)
if (frameworkFailures.length > 0) {
  console.error(
    `\nnode compatibility: ${frameworkFailures.length} row(s) installed completely and then failed to render`,
  )
  process.exitCode = 1
}

function platformPackage(): string {
  const arch = process.arch
  if (process.platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    return `darwin-${arch}`
  }
  if (process.platform === 'linux') {
    const report = process.report?.getReport() as
      | { header?: { glibcVersionRuntime?: string } }
      | undefined
    const libc = report?.header?.glibcVersionRuntime ? 'gnu' : 'musl'
    if (arch === 'x64') return `linux-x64-${libc}`
    if (arch === 'arm64' && libc === 'gnu') return 'linux-arm64-gnu'
  }
  if (process.platform === 'win32') {
    if (arch === 'arm64') return 'win32-arm64-msvc'
    if (arch === 'x64') return 'win32-x64-msvc'
  }
  throw new Error(
    `no candidate native package for ${process.platform}-${process.arch}`,
  )
}
void requireFromHere
