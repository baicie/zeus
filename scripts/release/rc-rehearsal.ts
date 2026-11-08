/**
 * Real offline RC rehearsal for the Zeus release group.
 *
 * This script is intentionally side-effectful: it rewrites package versions in
 * the checked-out worktree, runs the same install/build/package gates the
 * release pipeline uses, packs the 32 Core candidates, optionally builds the
 * paired UI and all six create-zeus templates, and restores the working tree
 * before writing the report. It never publishes, tags or pushes.
 */
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'
import { syncCreateZeusVersions } from './create-zeus-versions'
import {
  applyVersionRehearsal,
  assertRcVersion,
  writeVersionRehearsalReport,
} from './version-rehearsal'

import type { VersionRehearsalReport } from './version-rehearsal'

export const RC_REHEARSAL_SCHEMA = 'zeus.rc-rehearsal/v1'

const VITE_PLUGIN_PACKAGE = '@zeus-js/vite-plugin'
const DEFAULT_OUT = path.join('temp', 'release', 'rc-rehearsal.json')
const DEFAULT_LOG_DIR = path.join('temp', 'release', 'logs')
const CANDIDATE_OUTPUT = path.join('temp', 'create-zeus-candidate')
const DEFAULT_HEAVY_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_MATRIX_TIMEOUT_MS = 45 * 60 * 1000

export type RcRehearsalStepStatus = 'PASS' | 'FAIL' | 'SKIPPED'
export type RcRehearsalVerdict = 'REHEARSAL_PASS' | 'REHEARSAL_FAIL'

export interface RcRehearsalStep {
  readonly id: string
  readonly title: string
  readonly status: RcRehearsalStepStatus
  readonly command?: string
  readonly startedAt: string
  readonly durationMs: number
  readonly exitCode?: number | null
  readonly signal?: string | null
  readonly timedOut?: boolean
  readonly optional?: boolean
  readonly reason?: string
  readonly outputSummary?: string[]
  readonly log?: string
  readonly env?: Record<string, string>
}

export interface RehearsalTarball {
  readonly name: string
  readonly version: string
  readonly file: string
  readonly sha256: string
}

export interface RehearsalTarballReport {
  readonly directory: string
  readonly expectedCount: number
  readonly count: number
  readonly allVersionsMatch: boolean
  readonly allNamesMatch: boolean
  readonly packages: RehearsalTarball[]
  readonly problems: string[]
}

export interface RehearsalTemplateResult {
  readonly template: string
  readonly passed: boolean
  readonly error?: string
  readonly installed?: Record<string, string>
  readonly outputs?: string[]
}

export interface RcRehearsalReport {
  readonly schema: typeof RC_REHEARSAL_SCHEMA
  readonly generatedAt: string
  readonly version: string
  readonly root: string
  readonly expectHead: string
  readonly head: string
  readonly uiRoot?: string
  readonly uiVersion?: string
  readonly uiPinSync?: {
    readonly uiVersion: string
    readonly files: string[]
    readonly mismatches: string[]
  }
  readonly environment: {
    readonly platform: string
    readonly arch: string
    readonly node: string
    readonly nodeOptions?: string
  }
  readonly coverage: {
    readonly mode: 'all-six-templates' | 'basic-only' | 'not-covered'
    readonly sixTemplatesCovered: boolean
    readonly templates: string[]
    readonly note: string
  }
  readonly steps: RcRehearsalStep[]
  readonly versionRewrite: VersionRehearsalReport | null
  readonly tarballs: RehearsalTarballReport
  readonly templates: RehearsalTemplateResult[]
  readonly final: RcRehearsalVerdict
  readonly failureReasons: string[]
}

interface CommandOutcome {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly timedOut: boolean
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
  readonly error?: string
}

export interface RehearsalState {
  readonly root: string
  readonly version: string
  readonly expectHead: string
  readonly uiRoot?: string
  readonly nodeOptions?: string
  readonly logDir: string
  readonly steps: RcRehearsalStep[]
  versionRewrite: VersionRehearsalReport | null
  uiVersion?: string
  uiPinSync?: {
    uiVersion: string
    files: string[]
    mismatches: string[]
  }
  rewrittenFiles: string[]
  tarballs: RehearsalTarballReport
  templates: RehearsalTemplateResult[]
  head: string
  fatal?: string
}

interface CommandStepOptions {
  readonly id: string
  readonly title: string
  readonly command: string
  readonly args: readonly string[]
  readonly cwd?: string
  readonly timeoutMs?: number
  readonly optional?: boolean
  readonly env?: NodeJS.ProcessEnv
  /** Applies the recorded Node loader flags; only build-dts needs them. */
  readonly useNodeOptions?: boolean
}

function runCommand(
  command: string,
  args: readonly string[],
  options: {
    cwd: string
    timeoutMs: number
    env?: NodeJS.ProcessEnv
  },
): Promise<CommandOutcome> {
  const startedAt = Date.now()
  const shell = process.platform === 'win32'
  const finalArgs = shell
    ? args.map(argument =>
        /[\s"]/u.test(argument)
          ? `"${argument.replace(/"/g, '\\"')}"`
          : argument,
      )
    : [...args]
  return new Promise(resolve => {
    const child = execFile(
      command,
      finalArgs,
      {
        cwd: options.cwd,
        encoding: 'utf8',
        timeout: options.timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ...options.env },
        shell,
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startedAt
        const codeValue = (error as { code?: unknown } | null)?.code
        const code = error
          ? typeof codeValue === 'number'
            ? codeValue
            : null
          : 0
        resolve({
          exitCode: code,
          signal: error?.signal ?? null,
          timedOut: Boolean(error?.killed),
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          durationMs,
          ...(error && !error.killed
            ? { error: `${error.name}: ${error.message}` }
            : {}),
        })
      },
    )
    child.on('error', () => {
      // The callback above receives command errors; keeping this listener
      // avoids an unhandled EventEmitter error for spawn failures.
    })
  })
}

function summarize(outcome: CommandOutcome): string[] {
  const source = `${outcome.stdout}\n${outcome.stderr}`
  const lines = source
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)
  return lines
    .slice(-30)
    .map(line => (line.length > 500 ? `${line.slice(0, 500)}…` : line))
}

function writeLog(
  logDir: string,
  id: string,
  command: string,
  outcome: CommandOutcome,
): string | undefined {
  if (outcome.stdout.length === 0 && outcome.stderr.length === 0) {
    return undefined
  }
  fs.mkdirSync(logDir, { recursive: true })
  const file = path.join(logDir, `${id}.log`)
  fs.writeFileSync(
    file,
    `$ ${command}\n\n[stdout]\n${outcome.stdout}\n[stderr]\n${outcome.stderr}\n`,
  )
  return file
}

async function commandStep(
  state: RehearsalState,
  options: CommandStepOptions,
): Promise<CommandOutcome> {
  const startedAt = new Date().toISOString()
  const env: Record<string, string> | undefined =
    options.useNodeOptions && state.nodeOptions
      ? {
          NODE_OPTIONS: [process.env.NODE_OPTIONS, state.nodeOptions]
            .filter(Boolean)
            .join(' '),
          ...options.env,
        }
      : (options.env as Record<string, string> | undefined)
  const outcome = await runCommand(options.command, options.args, {
    cwd: options.cwd ?? state.root,
    timeoutMs: options.timeoutMs ?? DEFAULT_HEAVY_TIMEOUT_MS,
    ...(env ? { env } : {}),
  })
  const commandLine = [options.command, ...options.args].join(' ')
  const log = writeLog(state.logDir, options.id, commandLine, outcome)
  state.steps.push({
    id: options.id,
    title: options.title,
    status:
      outcome.exitCode === 0 && !outcome.timedOut && !outcome.error
        ? 'PASS'
        : 'FAIL',
    command: commandLine,
    startedAt,
    durationMs: outcome.durationMs,
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    timedOut: outcome.timedOut,
    ...(options.optional ? { optional: true } : {}),
    ...(outcome.exitCode === 0 && !outcome.timedOut && !outcome.error
      ? {}
      : {
          reason: outcome.timedOut
            ? `timed out after ${options.timeoutMs ?? DEFAULT_HEAVY_TIMEOUT_MS}ms`
            : (outcome.error ??
              `exited with code ${outcome.exitCode ?? 'unknown'}`),
        }),
    outputSummary: summarize(outcome),
    ...(env ? { env } : {}),
    ...(log ? { log } : {}),
  })
  return outcome
}

function addStep(
  state: RehearsalState,
  step: Omit<RcRehearsalStep, 'startedAt' | 'durationMs'> & {
    startedAt?: string
    durationMs?: number
  },
): void {
  const { startedAt, durationMs, ...rest } = step
  state.steps.push({
    ...rest,
    startedAt: startedAt ?? new Date().toISOString(),
    durationMs: durationMs ?? 0,
  })
}

function addSkipped(
  state: RehearsalState,
  id: string,
  title: string,
  reason: string,
  optional = false,
): void {
  addStep(state, {
    id,
    title,
    status: 'SKIPPED',
    reason,
    ...(optional ? { optional: true } : {}),
  })
}

function expectPackageNames(): string[] {
  return [...new Set([...zeusFixedPackages, VITE_PLUGIN_PACKAGE])]
}

function toPosix(file: string): string {
  return file.split(path.sep).join('/')
}

function templatePackageFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile() && entry.name === 'package.json')
        files.push(absolute)
    }
  }
  visit(root)
  return files.sort()
}

/**
 * Mirrors `afterVersion` with `ZEUS_UI_VERSION`: the paired UI owns its own
 * version, so the `@zeus-web/*` template pins must follow the checked-out UI,
 * not the Core RC version.
 */
function syncUiPinVersions(state: RehearsalState): {
  ok: boolean
  reason?: string
} {
  if (!state.uiRoot) return { ok: true }
  const manifestPath = path.join(state.uiRoot, 'package.json')
  let uiVersion: unknown
  try {
    uiVersion = (
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        version?: unknown
      }
    ).version
  } catch (error) {
    return {
      ok: false,
      reason: `cannot read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  if (typeof uiVersion !== 'string' || uiVersion.length === 0) {
    return { ok: false, reason: `${manifestPath} is missing a version` }
  }
  state.uiVersion = uiVersion

  const templatesRoot = path.join(
    state.root,
    'packages',
    'devtools',
    'create-zeus',
    'templates',
  )
  const before = new Map(
    templatePackageFiles(templatesRoot).map(file => [
      file,
      fs.readFileSync(file, 'utf8'),
    ]),
  )
  let mismatches: string[]
  try {
    mismatches = syncCreateZeusVersions({
      root: state.root,
      coreVersion: state.version,
      uiVersion,
    })
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
  const files = [...before.entries()]
    .filter(([file, content]) => fs.readFileSync(file, 'utf8') !== content)
    .map(([file]) => toPosix(path.relative(state.root, file)))
  state.uiPinSync = { uiVersion, files, mismatches }
  for (const file of files) {
    if (!state.rewrittenFiles.includes(file)) state.rewrittenFiles.push(file)
  }
  return { ok: true }
}

function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return undefined
  }
}

function git(
  state: RehearsalState,
  args: readonly string[],
): Promise<CommandOutcome> {
  return runCommand('git', args, {
    cwd: state.root,
    timeoutMs: 60_000,
  })
}

async function preflight(
  state: RehearsalState,
): Promise<{ ok: boolean; reason?: string }> {
  const clean = await git(state, ['status', '--porcelain'])
  if (clean.exitCode !== 0) {
    addStep(state, {
      id: 'preflight-clean',
      title: 'worktree is clean',
      status: 'FAIL',
      command: 'git status --porcelain',
      exitCode: clean.exitCode,
      reason: clean.error ?? `git status exited with ${clean.exitCode}`,
      outputSummary: summarize(clean),
    })
    return { ok: false, reason: 'worktree cleanliness check failed' }
  }
  const dirty = clean.stdout.trim()
  if (dirty.length > 0) {
    addStep(state, {
      id: 'preflight-clean',
      title: 'worktree is clean',
      status: 'FAIL',
      command: 'git status --porcelain',
      exitCode: 0,
      reason: 'worktree has uncommitted changes',
      outputSummary: summarize(clean),
    })
    return { ok: false, reason: 'worktree is not clean' }
  }
  addStep(state, {
    id: 'preflight-clean',
    title: 'worktree is clean',
    status: 'PASS',
    command: 'git status --porcelain',
    exitCode: 0,
    outputSummary: [],
  })

  const head = await git(state, ['rev-parse', 'HEAD'])
  if (head.exitCode !== 0) {
    addStep(state, {
      id: 'preflight-head',
      title: 'HEAD matches --expect-head',
      status: 'FAIL',
      command: 'git rev-parse HEAD',
      exitCode: head.exitCode,
      reason: head.error ?? 'cannot resolve HEAD',
      outputSummary: summarize(head),
    })
    return { ok: false, reason: 'HEAD cannot be resolved' }
  }
  state.head = head.stdout.trim()
  const resolved = await git(state, [
    'rev-parse',
    '--verify',
    `${state.expectHead}^{commit}`,
  ])
  if (resolved.exitCode !== 0) {
    addStep(state, {
      id: 'preflight-head',
      title: 'HEAD matches --expect-head',
      status: 'FAIL',
      command: `git rev-parse --verify ${state.expectHead}^{commit}`,
      exitCode: resolved.exitCode,
      reason: `cannot resolve --expect-head ${state.expectHead}`,
      outputSummary: summarize(resolved),
    })
    return { ok: false, reason: '--expect-head cannot be resolved' }
  }
  const expected = resolved.stdout.trim()
  if (expected !== state.head) {
    addStep(state, {
      id: 'preflight-head',
      title: 'HEAD matches --expect-head',
      status: 'FAIL',
      command: `git rev-parse --verify ${state.expectHead}^{commit}`,
      exitCode: 0,
      reason: `HEAD ${state.head} != expected ${expected}`,
      outputSummary: [],
    })
    return {
      ok: false,
      reason: `HEAD ${state.head} does not match --expect-head ${expected}`,
    }
  }
  addStep(state, {
    id: 'preflight-head',
    title: 'HEAD matches --expect-head',
    status: 'PASS',
    command: `git rev-parse --verify ${state.expectHead}^{commit}`,
    exitCode: 0,
    outputSummary: [state.head],
  })

  try {
    assertRcVersion(state.version)
  } catch (error) {
    addStep(state, {
      id: 'preflight-version',
      title: 'target version is an RC version',
      status: 'FAIL',
      reason: error instanceof Error ? error.message : String(error),
      outputSummary: [],
    })
    return { ok: false, reason: 'target version is not an RC version' }
  }
  addStep(state, {
    id: 'preflight-version',
    title: 'target version is an RC version',
    status: 'PASS',
    outputSummary: [state.version],
  })

  return { ok: true }
}

function validatePrepare(state: RehearsalState): {
  ok: boolean
  reason?: string
} {
  const prepareFile = path.join(state.root, CANDIDATE_OUTPUT, 'prepare.json')
  const prepare = readJson<{
    schema?: string
    coreVersion?: string
    platform?: string
    arch?: string
    packages?: Array<{ name?: string; version?: string }>
  }>(prepareFile)
  if (!prepare) {
    return {
      ok: false,
      reason: `missing ${path.relative(state.root, prepareFile)}`,
    }
  }
  if (prepare.schema !== 'zeus.create-zeus-candidate-prepare/v1') {
    return { ok: false, reason: `unexpected prepare schema ${prepare.schema}` }
  }
  if (prepare.coreVersion !== state.version) {
    return {
      ok: false,
      reason: `prepare coreVersion ${prepare.coreVersion} != ${state.version}`,
    }
  }
  const expected = expectPackageNames()
  const packages = prepare.packages ?? []
  if (packages.length !== expected.length) {
    return {
      ok: false,
      reason: `prepare packed ${packages.length} packages, expected ${expected.length}`,
    }
  }
  const names = new Set(packages.map(entry => entry.name))
  const missing = expected.filter(name => !names.has(name))
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `prepare is missing packages: ${missing.join(', ')}`,
    }
  }
  return { ok: true }
}

function validateTarballs(state: RehearsalState): RehearsalTarballReport {
  const prepareFile = path.join(state.root, CANDIDATE_OUTPUT, 'prepare.json')
  const prepare = readJson<{
    archives?: string
    packages?: Array<{
      name?: string
      version?: string
      file?: string
      sha256?: string
    }>
  }>(prepareFile)
  const directory =
    prepare?.archives ??
    path.join(os.tmpdir(), 'zeus-create-zeus-candidate-archives')
  const expectedNames = expectPackageNames()
  const problems: string[] = []
  const packages: RehearsalTarball[] = []

  if (!prepare) {
    problems.push(
      `candidate prepare report is missing: ${path.relative(state.root, prepareFile)}`,
    )
  }

  const entries = prepare?.packages ?? []
  for (const entry of entries) {
    const name = entry.name ?? ''
    const file = entry.file
      ? path.isAbsolute(entry.file)
        ? entry.file
        : path.join(directory, entry.file)
      : ''
    if (!file || !fs.existsSync(file)) {
      problems.push(`candidate tarball is missing for ${name || '(unnamed)'}`)
      continue
    }
    const sha256 = sha256File(file)
    if (entry.sha256 && entry.sha256 !== sha256) {
      problems.push(`sha256 mismatch for ${name}: ${sha256} != ${entry.sha256}`)
    }
    let manifest: { name?: string; version?: string } | undefined
    try {
      manifest = JSON.parse(
        execFileSync('tar', ['-xOf', file, 'package/package.json'], {
          encoding: 'utf8',
          maxBuffer: 8 * 1024 * 1024,
        }),
      ) as { name?: string; version?: string }
    } catch (error) {
      problems.push(
        `cannot read packed manifest for ${name}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (manifest?.name !== name) {
      problems.push(
        `packed manifest name ${manifest?.name ?? '(missing)'} != ${name}`,
      )
    }
    if (manifest?.version !== state.version) {
      problems.push(
        `packed manifest version ${manifest?.version ?? '(missing)'} != ${state.version}`,
      )
    }
    if (entry.version && entry.version !== state.version) {
      problems.push(
        `prepare version ${entry.version} for ${name} != ${state.version}`,
      )
    }
    packages.push({
      name,
      version: manifest?.version ?? entry.version ?? '(missing)',
      file,
      sha256,
    })
  }

  if (fs.existsSync(directory)) {
    const archives = fs
      .readdirSync(directory)
      .filter(file => file.endsWith('.tgz'))
      .sort()
    if (archives.length !== entries.length) {
      problems.push(
        `archives directory contains ${archives.length} tarball(s), prepare recorded ${entries.length}`,
      )
    }
  } else if (entries.length > 0) {
    problems.push(`archives directory is missing: ${directory}`)
  }

  const seen = new Set(packages.map(entry => entry.name))
  const missing = expectedNames.filter(name => !seen.has(name))
  const unexpected = packages
    .map(entry => entry.name)
    .filter(name => !expectedNames.includes(name))
  if (missing.length > 0) {
    problems.push(`missing candidate packages: ${missing.join(', ')}`)
  }
  if (unexpected.length > 0) {
    problems.push(`unexpected candidate packages: ${unexpected.join(', ')}`)
  }

  return {
    directory,
    expectedCount: expectedNames.length,
    count: packages.length,
    allVersionsMatch:
      packages.length === expectedNames.length &&
      packages.every(entry => entry.version === state.version),
    allNamesMatch: missing.length === 0 && unexpected.length === 0,
    packages,
    problems,
  }
}

function readCandidateTemplates(
  state: RehearsalState,
): RehearsalTemplateResult[] {
  const report = readJson<{
    templates?: Array<{
      template?: string
      passed?: boolean
      error?: string
      installed?: Record<string, string>
      outputs?: string[]
    }>
  }>(path.join(state.root, CANDIDATE_OUTPUT, 'report.json'))
  return (report?.templates ?? []).map(template => ({
    template: template.template ?? '(unknown)',
    passed: template.passed === true,
    ...(template.error ? { error: template.error } : {}),
    ...(template.installed ? { installed: template.installed } : {}),
    ...(template.outputs ? { outputs: template.outputs } : {}),
  }))
}

async function restoreVersionFiles(state: RehearsalState): Promise<void> {
  const startedAt = new Date().toISOString()
  if (state.rewrittenFiles.length === 0) {
    state.steps.push({
      id: 'restore',
      title: 'restore rewritten version files',
      status: 'PASS',
      startedAt,
      durationMs: 0,
      reason: 'no version rewrites were applied',
      outputSummary: [],
    })
    return
  }
  const outcome = await runCommand(
    'git',
    ['restore', '--worktree', '--', ...state.rewrittenFiles],
    { cwd: state.root, timeoutMs: 60_000 },
  )
  state.steps.push({
    id: 'restore',
    title: 'restore rewritten version files',
    status: outcome.exitCode === 0 && !outcome.timedOut ? 'PASS' : 'FAIL',
    command: `git restore --worktree -- ${state.rewrittenFiles.join(' ')}`,
    startedAt,
    durationMs: outcome.durationMs,
    exitCode: outcome.exitCode,
    ...(outcome.exitCode === 0 && !outcome.timedOut
      ? {}
      : {
          reason:
            outcome.error ?? `git restore exited with ${outcome.exitCode}`,
        }),
    outputSummary: summarize(outcome),
  })
}

async function verifyClean(state: RehearsalState): Promise<void> {
  const startedAt = new Date().toISOString()
  const outcome = await git(state, ['status', '--porcelain'])
  const dirty = outcome.stdout.trim()
  const ok = outcome.exitCode === 0 && dirty.length === 0
  state.steps.push({
    id: 'verify-clean',
    title: 'worktree is clean after restore',
    status: ok ? 'PASS' : 'FAIL',
    command: 'git status --porcelain',
    startedAt,
    durationMs: outcome.durationMs,
    exitCode: outcome.exitCode,
    ...(ok
      ? {}
      : {
          reason:
            outcome.exitCode !== 0
              ? (outcome.error ?? `git status exited with ${outcome.exitCode}`)
              : `worktree still has changes: ${dirty.split(/\r?\n/).slice(0, 10).join('; ')}`,
        }),
    outputSummary: summarize(outcome),
  })
}

function computeVerdict(state: RehearsalState): {
  final: RcRehearsalVerdict
  failureReasons: string[]
} {
  const failureReasons: string[] = []
  for (const step of state.steps) {
    if (step.status === 'FAIL') {
      failureReasons.push(`${step.id}: ${step.reason ?? 'failed'}`)
    } else if (step.status === 'SKIPPED' && step.optional !== true) {
      failureReasons.push(`${step.id}: skipped (${step.reason ?? 'no reason'})`)
    }
  }
  if (state.fatal) failureReasons.push(`fatal: ${state.fatal}`)
  return {
    final: failureReasons.length === 0 ? 'REHEARSAL_PASS' : 'REHEARSAL_FAIL',
    failureReasons,
  }
}

function coverage(state: RehearsalState): RcRehearsalReport['coverage'] {
  const matrix = state.steps.find(step => step.id === 'candidate-matrix')
  if (!state.uiRoot) {
    return {
      mode: 'basic-only',
      sixTemplatesCovered: false,
      templates: ['basic-ts'],
      note: '--ui-root was not provided; only the basic-ts template was exercised',
    }
  }
  const covered = matrix?.status === 'PASS'
  return {
    mode: covered ? 'all-six-templates' : 'not-covered',
    sixTemplatesCovered: covered,
    templates: covered
      ? [
          'basic-ts',
          'application-ts',
          'admin-ts',
          'web-component-ts',
          'component-library-ts',
          'webc-consumer-ts',
        ]
      : [],
    note: covered
      ? 'all six create-zeus templates installed and built from isolated candidate tarballs'
      : 'the six-template matrix did not complete',
  }
}

async function runRehearsal(state: RehearsalState): Promise<void> {
  const gate = await preflight(state)
  if (!gate.ok) {
    const reason = gate.reason ?? 'preflight failed'
    for (const [id, title] of [
      ['version-rewrite', 'rewrite release group versions'],
      ['ui-pin-sync', 'sync paired UI template pins'],
      ['install', 'pnpm install --frozen-lockfile'],
      ['build', 'pnpm build'],
      ['build-dts', 'pnpm build-dts'],
      ['check-package-versions', 'pnpm check:package-versions'],
      ['check-create-zeus-versions', 'pnpm check:create-zeus-versions'],
      ['candidate-prepare', 'pnpm check:create-zeus-candidate:prepare'],
      ['ui-install', 'install paired UI dependencies'],
      ['ui-build-button', 'build paired UI button closure'],
      ['candidate-matrix', 'create-zeus candidate matrix'],
      ['tarball-validation', 'validate candidate tarballs'],
    ] as const) {
      addSkipped(
        state,
        id,
        title,
        `preflight failed: ${reason}`,
        id.startsWith('ui-'),
      )
    }
    state.tarballs = {
      directory: path.join(os.tmpdir(), 'zeus-create-zeus-candidate-archives'),
      expectedCount: expectPackageNames().length,
      count: 0,
      allVersionsMatch: false,
      allNamesMatch: false,
      packages: [],
      problems: [`preflight failed: ${reason}`],
    }
    return
  }

  const rewriteStartedAt = new Date().toISOString()
  try {
    const report = applyVersionRehearsal({
      root: state.root,
      version: state.version,
    })
    writeVersionRehearsalReport(
      report,
      path.join(state.root, 'temp', 'release', 'version-rehearsal.json'),
    )
    state.versionRewrite = report
    state.rewrittenFiles = report.modifiedFiles.map(file => file.file)
    state.steps.push({
      id: 'version-rewrite',
      title: 'rewrite release group versions',
      status: 'PASS',
      startedAt: rewriteStartedAt,
      durationMs: Date.now() - new Date(rewriteStartedAt).getTime(),
      reason: `${report.modifiedFiles.length} file(s), ${report.edits.length} edit(s)`,
      outputSummary: report.modifiedFiles.map(
        file => `${file.file} (${file.edits} edit(s))`,
      ),
    })
  } catch (error) {
    state.steps.push({
      id: 'version-rewrite',
      title: 'rewrite release group versions',
      status: 'FAIL',
      startedAt: rewriteStartedAt,
      durationMs: Date.now() - new Date(rewriteStartedAt).getTime(),
      reason: error instanceof Error ? error.message : String(error),
      outputSummary: [],
    })
    for (const [id, title] of [
      ['install', 'pnpm install --frozen-lockfile'],
      ['build', 'pnpm build'],
      ['build-dts', 'pnpm build-dts'],
      ['check-package-versions', 'pnpm check:package-versions'],
      ['check-create-zeus-versions', 'pnpm check:create-zeus-versions'],
      ['candidate-prepare', 'pnpm check:create-zeus-candidate:prepare'],
      ['ui-install', 'install paired UI dependencies'],
      ['ui-build-button', 'build paired UI button closure'],
      ['candidate-matrix', 'create-zeus candidate matrix'],
      ['tarball-validation', 'validate candidate tarballs'],
    ] as const) {
      addSkipped(
        state,
        id,
        title,
        'version rewrite failed',
        id.startsWith('ui-'),
      )
    }
    state.tarballs = {
      directory: path.join(os.tmpdir(), 'zeus-create-zeus-candidate-archives'),
      expectedCount: expectPackageNames().length,
      count: 0,
      allVersionsMatch: false,
      allNamesMatch: false,
      packages: [],
      problems: ['version rewrite failed'],
    }
    return
  }

  if (state.uiRoot) {
    const startedAt = new Date().toISOString()
    const result = syncUiPinVersions(state)
    state.steps.push({
      id: 'ui-pin-sync',
      title: 'sync paired UI template pins',
      status: result.ok ? 'PASS' : 'FAIL',
      startedAt,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      reason: result.ok
        ? `${state.uiPinSync?.files.length ?? 0} file(s) synced to UI ${state.uiVersion}`
        : result.reason,
      outputSummary: state.uiPinSync?.mismatches ?? [],
    })
  } else {
    addSkipped(
      state,
      'ui-pin-sync',
      'sync paired UI template pins',
      '--ui-root was not provided',
      true,
    )
  }

  const install = await commandStep(state, {
    id: 'install',
    title: 'pnpm install --frozen-lockfile',
    command: 'pnpm',
    args: ['install', '--frozen-lockfile'],
    timeoutMs: DEFAULT_HEAVY_TIMEOUT_MS,
  })

  if (install.exitCode === 0 && !install.timedOut) {
    await commandStep(state, {
      id: 'build',
      title: 'pnpm build',
      command: 'pnpm',
      args: ['build'],
      timeoutMs: DEFAULT_HEAVY_TIMEOUT_MS,
    })

    await commandStep(state, {
      id: 'build-dts',
      title: 'pnpm build-dts',
      command: 'pnpm',
      args: ['build-dts'],
      timeoutMs: DEFAULT_HEAVY_TIMEOUT_MS,
      useNodeOptions: true,
    })

    await commandStep(state, {
      id: 'check-package-versions',
      title: 'pnpm check:package-versions',
      command: 'pnpm',
      args: ['check:package-versions'],
      timeoutMs: 10 * 60 * 1000,
    })

    await commandStep(state, {
      id: 'check-create-zeus-versions',
      title: 'pnpm check:create-zeus-versions',
      command: 'pnpm',
      args: ['check:create-zeus-versions'],
      timeoutMs: 10 * 60 * 1000,
      ...(state.uiVersion ? { env: { ZEUS_UI_VERSION: state.uiVersion } } : {}),
    })
  } else {
    for (const [id, title] of [
      ['build', 'pnpm build'],
      ['build-dts', 'pnpm build-dts'],
      ['check-package-versions', 'pnpm check:package-versions'],
      ['check-create-zeus-versions', 'pnpm check:create-zeus-versions'],
    ] as const) {
      addSkipped(state, id, title, 'pnpm install failed')
    }
  }

  const prepareReportDir = path.join(state.root, CANDIDATE_OUTPUT)
  fs.rmSync(prepareReportDir, { recursive: true, force: true })
  fs.rmSync(path.join(os.tmpdir(), 'zeus-create-zeus-candidate-archives'), {
    recursive: true,
    force: true,
  })

  const buildStep = state.steps.find(step => step.id === 'build')
  const dtsStep = state.steps.find(step => step.id === 'build-dts')
  const candidateInputsReady =
    buildStep?.status === 'PASS' && dtsStep?.status === 'PASS'
  let prepareOk = false
  if (!candidateInputsReady) {
    addSkipped(
      state,
      'candidate-prepare',
      'pnpm check:create-zeus-candidate:prepare',
      'pnpm build and pnpm build-dts must both pass',
    )
  } else {
    const args = ['check:create-zeus-candidate:prepare']
    if (state.uiRoot) args.push('--ui-root', state.uiRoot)
    const prepare = await commandStep(state, {
      id: 'candidate-prepare',
      title: 'pnpm check:create-zeus-candidate:prepare',
      command: 'pnpm',
      args,
      timeoutMs: DEFAULT_HEAVY_TIMEOUT_MS,
    })
    const validation = validatePrepare(state)
    if (prepare.exitCode === 0 && !prepare.timedOut && validation.ok) {
      prepareOk = true
    } else if (prepare.exitCode === 0 && !prepare.timedOut && !validation.ok) {
      const step = state.steps.find(item => item.id === 'candidate-prepare')
      if (step) {
        state.steps[state.steps.indexOf(step)] = {
          ...step,
          status: 'FAIL',
          reason: validation.reason ?? 'prepare report validation failed',
        }
      }
    }
  }

  let uiInstalled = false
  if (state.uiRoot) {
    if (!prepareOk) {
      addSkipped(
        state,
        'ui-install',
        'install paired UI dependencies',
        'candidate prepare did not produce UI overrides',
      )
    } else {
      const uiInstall = await commandStep(state, {
        id: 'ui-install',
        title: 'install paired UI dependencies',
        command: 'pnpm',
        args: [
          'install',
          '--ignore-scripts',
          '--no-frozen-lockfile',
          '--config.confirmModulesPurge=false',
        ],
        cwd: state.uiRoot,
        timeoutMs: DEFAULT_HEAVY_TIMEOUT_MS,
      })
      uiInstalled = uiInstall.exitCode === 0 && !uiInstall.timedOut
    }

    if (!uiInstalled) {
      addSkipped(
        state,
        'ui-build-button',
        'build paired UI button closure',
        'paired UI dependency install failed',
      )
    } else {
      await commandStep(state, {
        id: 'ui-build-button',
        title: 'build paired UI button closure',
        command: 'pnpm',
        args: ['exec', 'tsx', 'scripts/commands/build.ts', 'button'],
        cwd: state.uiRoot,
        timeoutMs: DEFAULT_HEAVY_TIMEOUT_MS,
      })
    }
  } else {
    addSkipped(
      state,
      'ui-install',
      'install paired UI dependencies',
      '--ui-root was not provided',
      true,
    )
    addSkipped(
      state,
      'ui-build-button',
      'build paired UI button closure',
      '--ui-root was not provided',
      true,
    )
  }

  const uiBuild = state.steps.find(step => step.id === 'ui-build-button')
  const candidateMatrixReady = state.uiRoot
    ? prepareOk && uiBuild?.status === 'PASS'
    : candidateInputsReady
  if (!candidateMatrixReady) {
    addSkipped(
      state,
      'candidate-matrix',
      'create-zeus candidate matrix',
      state.uiRoot
        ? 'candidate prepare or paired UI build did not pass'
        : 'pnpm build and pnpm build-dts must both pass',
    )
  } else {
    const candidates = path.join(CANDIDATE_OUTPUT, 'candidates.json')
    const candidatesFile = path.join(state.root, candidates)
    const args = ['check:create-zeus-candidate']
    if (state.uiRoot) {
      args.push('--ui-root', state.uiRoot)
      if (fs.existsSync(candidatesFile)) {
        args.push('--candidates', candidates, '--require-pin-match')
      }
    } else if (fs.existsSync(candidatesFile)) {
      args.push('--candidates', candidates)
    }
    await commandStep(state, {
      id: 'candidate-matrix',
      title: 'create-zeus candidate matrix',
      command: 'pnpm',
      args,
      timeoutMs: DEFAULT_MATRIX_TIMEOUT_MS,
    })
    state.templates = readCandidateTemplates(state)
  }

  state.tarballs = validateTarballs(state)
  addStep(state, {
    id: 'tarball-validation',
    title: 'validate candidate tarballs',
    status: state.tarballs.problems.length === 0 ? 'PASS' : 'FAIL',
    startedAt: new Date().toISOString(),
    durationMs: 0,
    reason:
      state.tarballs.problems.length === 0
        ? `${state.tarballs.count}/${state.tarballs.expectedCount} tarballs at ${state.version}`
        : state.tarballs.problems.join('; '),
    outputSummary: state.tarballs.packages.map(
      entry => `${entry.name}@${entry.version} ${entry.sha256}`,
    ),
  })
}

export function createEmptyState(options: {
  root: string
  version: string
  expectHead: string
  uiRoot?: string
  nodeOptions?: string
  logDir?: string
}): RehearsalState {
  return {
    root: path.resolve(options.root),
    version: options.version,
    expectHead: options.expectHead,
    ...(options.uiRoot
      ? { uiRoot: path.resolve(options.root, options.uiRoot) }
      : {}),
    ...(options.nodeOptions ? { nodeOptions: options.nodeOptions } : {}),
    logDir: options.logDir
      ? path.resolve(options.root, options.logDir)
      : path.join(path.resolve(options.root), DEFAULT_LOG_DIR),
    steps: [],
    versionRewrite: null,
    rewrittenFiles: [],
    tarballs: {
      directory: path.join(os.tmpdir(), 'zeus-create-zeus-candidate-archives'),
      expectedCount: expectPackageNames().length,
      count: 0,
      allVersionsMatch: false,
      allNamesMatch: false,
      packages: [],
      problems: [],
    },
    templates: [],
    head: '',
  }
}

export function buildReport(state: RehearsalState): RcRehearsalReport {
  const { final, failureReasons } = computeVerdict(state)
  return {
    schema: RC_REHEARSAL_SCHEMA,
    generatedAt: new Date().toISOString(),
    version: state.version,
    root: state.root,
    expectHead: state.expectHead,
    head: state.head,
    ...(state.uiRoot ? { uiRoot: state.uiRoot } : {}),
    ...(state.uiVersion ? { uiVersion: state.uiVersion } : {}),
    ...(state.uiPinSync ? { uiPinSync: state.uiPinSync } : {}),
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      ...(state.nodeOptions ? { nodeOptions: state.nodeOptions } : {}),
    },
    coverage: coverage(state),
    steps: state.steps,
    versionRewrite: state.versionRewrite,
    tarballs: state.tarballs,
    templates: state.templates,
    final,
    failureReasons,
  }
}

export async function runRcRehearsal(options: {
  root: string
  version: string
  expectHead: string
  uiRoot?: string
  nodeOptions?: string
  out?: string
  logDir?: string
}): Promise<RcRehearsalReport> {
  const state = createEmptyState(options)
  try {
    await runRehearsal(state)
  } catch (error) {
    state.fatal = error instanceof Error ? error.message : String(error)
  } finally {
    await restoreVersionFiles(state)
    await verifyClean(state)
    const report = buildReport(state)
    const out = path.resolve(state.root, options.out ?? DEFAULT_OUT)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
    return report
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      'expect-head': { type: 'string' },
      root: { type: 'string' },
      out: { type: 'string', default: DEFAULT_OUT },
      'ui-root': { type: 'string' },
      'log-dir': { type: 'string' },
      'node-options': { type: 'string' },
    },
  })
  if (!values.version || !values['expect-head']) {
    console.error(
      'usage: tsx scripts/release/rc-rehearsal.ts --version <X.Y.Z-rc.N> --expect-head <sha> [--root <path>] [--ui-root <path>] [--out <file>] [--node-options <flags>]',
    )
    process.exitCode = 2
    return
  }
  const report = await runRcRehearsal({
    root: values.root ?? process.cwd(),
    version: values.version,
    expectHead: values['expect-head'],
    ...(values['ui-root'] ? { uiRoot: values['ui-root'] } : {}),
    ...(values['node-options'] ? { nodeOptions: values['node-options'] } : {}),
    ...(values.out ? { out: values.out } : {}),
    ...(values['log-dir'] ? { logDir: values['log-dir'] } : {}),
  })
  console.log(`${report.final} (${report.steps.length} steps)`)
  for (const step of report.steps) {
    console.log(
      `  ${step.status.padEnd(7)} ${step.id}${step.reason ? ` — ${step.reason}` : ''}`,
    )
  }
  if (report.failureReasons.length > 0) {
    for (const reason of report.failureReasons) console.error(`FAIL ${reason}`)
  }
  if (report.final !== 'REHEARSAL_PASS') process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main()
}
