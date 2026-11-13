/**
 * Installs the local zeus-ui `@zeus-web/dialog` build into the Admin example.
 *
 * Why this exists: the R6-C gate asserts that the dialog can be closed and
 * reopened, and those assertions only hold on a build that contains
 * `fix/dialog-state-and-focus`. The published `beta.34` does not. Verifying
 * the integration therefore needs *a build*, and the options are:
 *
 * - publish a new `@zeus-web/dialog` — correct, but a release is not something
 *   a pull request may do;
 * - commit the built package under `vendor/` — does not work: the repository
 *   ignores `dist`, so the committed copy has a manifest and no code, and the
 *   failure only shows up in CI (it did);
 * - build it here, from the sibling checkout, for the duration of a local run.
 *
 * This is the third option. It writes the package into `node_modules` the way
 * a published install would look, and records what it replaced so
 * `--restore` puts the published version back. Nothing it writes is
 * committed.
 *
 * **It is not a substitute for a release.** `check:admin` in CI runs against
 * the published version; this script is for proving the integration locally
 * and before a release is tagged.
 *
 * Usage:
 *
 *   pnpm admin:link-dialog          # build zeus-ui and install it here
 *   pnpm admin:link-dialog --check  # verify only, change nothing
 *   pnpm admin:link-dialog --restore
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

const root = path.resolve(import.meta.dirname, '../..')
const adminDirectory = path.join(root, 'examples/admin')
const installTarget = path.join(
  adminDirectory,
  'node_modules/@zeus-web/dialog',
)
const marker = path.join(installTarget, '.zeus-local-build.json')

/** The marker the fixed build writes: one of its state symbols. */
const FIX_MARKER = '@zeus-web/dialog/state'

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    restore: { type: 'boolean', default: false },
    'ui-root': { type: 'string' },
  },
})

/**
 * The zeus-ui checkout this repository is being used beside.
 *
 * Deliberately not configurable by default: a relative sibling is how the two
 * repositories are laid out for every existing script (`demos-pages.yml`
 * clones them the same way), and a path that silently points somewhere else
 * would make this check vouch for a build nobody looked at.
 */
function findUiRoot(): string {
  const explicit = values['ui-root']
  if (explicit) return path.resolve(explicit)
  const candidate = path.resolve(root, '../zeus-ui')
  if (!fs.existsSync(path.join(candidate, 'packages/primitives/dialog'))) {
    throw new Error(
      `no zeus-ui checkout at ${candidate}. Pass --ui-root <path> if it lives elsewhere.`,
    )
  }
  return candidate
}

function installedVersion(): string | undefined {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(installTarget, 'package.json'), 'utf8'),
    ) as { version?: string }
    return manifest.version
  } catch {
    return undefined
  }
}

function carriesFix(): boolean {
  const entry = path.join(installTarget, 'dist/wc/zw-dialog.entry.js')
  try {
    return fs.readFileSync(entry, 'utf8').includes(FIX_MARKER)
  } catch {
    return false
  }
}

function report(): void {
  const version = installedVersion()
  const fixed = carriesFix()
  console.log(`dialog installed: ${version ?? '<missing>'}`)
  console.log(`carries the state fix: ${fixed ? 'yes' : 'no'}`)
  if (!fixed) {
    console.log(
      '\nThe Admin gallery gate asserts Escape/reopen/focus-trap on all three engines.',
      '\nAgainst a build without the fix it fails — correctly. Run:',
      '\n  pnpm admin:link-dialog',
      '\nto install the local build, or publish a @zeus-web/dialog that contains it.',
    )
  }
}

function buildAndInstall(): void {
  const uiRoot = findUiRoot()
  execFileSync('pnpm', ['--filter', '@zeus-web/dialog', 'build'], {
    cwd: uiRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  const built = path.join(uiRoot, 'packages/primitives/dialog')
  if (!fs.existsSync(path.join(built, 'dist/wc/auto.js'))) {
    throw new Error(`the dialog build produced no wc/auto.js under ${built}`)
  }

  /*
   * Replace the installed copy rather than linking to the source package.
   *
   * `vite` and `tsc` both resolve through `node_modules`, and a symlink to a
   * workspace package would drag in that workspace's own dependency versions —
   * which is a different resolution from the one an install performs. Copying
   * keeps this check honest about *the artifact*, not about a workspace.
   */
  fs.rmSync(installTarget, { recursive: true, force: true })
  fs.mkdirSync(installTarget, { recursive: true })
  for (const entry of ['package.json', 'dist', 'README.md']) {
    const source = path.join(built, entry)
    if (!fs.existsSync(source)) continue
    fs.cpSync(source, path.join(installTarget, entry), { recursive: true })
  }
  /*
   * The runtime peers have to travel with it. A published install pulls them
   * in from the registry; a copy has no registry entry, so without them the
   * bundler fails on `@zeus-js/web-c-runtime` — which reads as "the dialog is
   * broken" rather than "the staging is incomplete".
   *
   * They are copied from zeus-ui's own node_modules, so the versions are the
   * ones that package was built and tested against, not whatever this
   * repository happens to resolve.
   */
  for (const peer of ['@zeus-js', '@zeus-web/zeus-compat']) {
    const source = path.join(built, 'node_modules', peer)
    if (!fs.existsSync(source)) continue
    const destination = path.join(installTarget, 'node_modules', peer)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.cpSync(fs.realpathSync(source), destination, { recursive: true })
  }
  fs.writeFileSync(
    marker,
    `${JSON.stringify(
      {
        source: built,
        builtAt: new Date().toISOString(),
        note: 'local build; pnpm admin:link-dialog --restore puts the published version back',
      },
      null,
      2,
    )}\n`,
  )
  report()
}

function restore(): void {
  /*
   * Unconditional. The marker is written by the build path, but a copy can
   * also be left behind by an interrupted run, and "nothing to restore" when
   * a local build *is* installed leaves the tree in a state the next gate
   * runs against without saying so. Reinstalling through pnpm is idempotent
   * and is the only thing that restores the peer resolution pnpm chose.
   */
  fs.rmSync(installTarget, { recursive: true, force: true })
  fs.rmSync(marker, { force: true })
  /*
   * Reinstalling through pnpm is what puts the published package back with the
   * right peer resolution. This has to run from the repository root: the
   * install is workspace-wide and pnpm resolves overrides there.
   */
  execFileSync('pnpm', ['install', '--no-frozen-lockfile'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  report()
}

if (values.restore) {
  restore()
} else if (values.check) {
  report()
  if (!carriesFix()) {
    process.exitCode = 1
  }
} else {
  buildAndInstall()
}
