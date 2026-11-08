/**
 * AI workspace backup restore transaction.
 *
 * The restore is deliberately split into prepare, switch, verify and cleanup
 * stages so that a permission error, a failed `mv`, a full disk or a killed
 * process can never leave the host with the old workspace gone and a broken
 * new workspace active:
 *
 *   recover interrupted state → sha256 → archive listing validation →
 *   extract to candidate → chown + non-root read/write check → switch →
 *   content verification → remove the previous workspace
 *
 * Crash recovery uses `/data/.zeus-workspace-restore.state`:
 *
 *   phase=prepared        the active workspace may still be in place
 *   phase=previous-moved  the active workspace is at .zeus-workspace-previous
 *   phase=switched        the prepared workspace was atomically renamed into
 *                         place and is complete; the previous copy is stale
 *   phase=verified        the active workspace passed content verification
 *
 * If the process dies while `previous` exists and the phase is not `switched`
 * or `verified`, the previous copy is authoritative: an existing active
 * directory is moved aside as `.zeus-workspace-restore-interrupted-*` and
 * `previous` is renamed back to `/data/workspace`. With phase `switched` or
 * `verified`, the rename already completed, so the new workspace is kept and
 * the stale previous copy is removed.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

import { sha256File } from './deployment-layout'

export interface WorkspaceArchiveDescriptor {
  readonly file: string
  readonly sha256: string
  readonly entries: number
}

/**
 * Test-only hooks. Production never sets them; they let the recovery suite
 * inject real Docker faults without mocking the transaction.
 */
export interface WorkspaceRestoreHooks {
  /** Extra `docker run -v` mounts, for example a directory of fake binaries. */
  readonly extraVolumes?: readonly string[]
  /** Prepended to PATH inside restore containers. */
  readonly pathPrefix?: string
  /** Mount /data read-only to provoke a real permission failure. */
  readonly dataReadOnly?: boolean
  /** Abruptly exit the container at a transaction boundary. */
  readonly crashAfter?: 'extract' | 'previous-moved' | 'switched'
  /** Pause the container at a transaction boundary for an external kill. */
  readonly pauseAfter?: 'extract' | 'previous-moved' | 'switched'
  /** Container name used with pauseAfter so a test can `docker kill` it. */
  readonly containerName?: string
  /** Remove the first workspace entry after the switch to fail verification. */
  readonly corruptAfterSwitch?: boolean
  /** Apply `ulimit -f` to the extract container to simulate a full disk. */
  readonly extractFileLimitBlocks?: number
}

export interface WorkspaceRestoreInput {
  readonly archive: WorkspaceArchiveDescriptor
  readonly dataDir: string
  readonly image: string
  readonly hooks?: WorkspaceRestoreHooks
}

export interface WorkspaceRecoveryInput {
  readonly dataDir: string
  readonly image: string
  readonly hooks?: WorkspaceRestoreHooks
}

export interface WorkspaceRecoveryResult {
  readonly recovered: boolean
  readonly restoredPrevious: boolean
  readonly removedPrevious: boolean
  readonly interruptedDir?: string
  readonly action: string
}

export interface WorkspaceRestoreResult {
  readonly file: string
  readonly sha256: string
  readonly entries: number
  readonly recovery: WorkspaceRecoveryResult
  readonly warnings: readonly string[]
}

export type WorkspaceEntryType = 'directory' | 'file' | 'symlink'

export interface WorkspaceArchiveEntry {
  readonly path: string
  readonly type: WorkspaceEntryType
  readonly target?: string
}

interface DockerResult {
  readonly status: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly error?: Error
}

const ROOT_ENTRY = 'workspace'
const DEFAULT_PATH =
  '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
const MAX_SYMLINK_HOPS = 40

const ARCHIVE_PREFLIGHT_SCRIPT = `
set -eu
tar -tzf "$ZEUS_WORKSPACE_ARCHIVE"
`

const ARCHIVE_VERBOSE_SCRIPT = `
set -eu
tar -tvzf "$ZEUS_WORKSPACE_ARCHIVE"
`

const EXTRACT_SCRIPT = `
set -eu
if [ -n "\${ZEUS_WORKSPACE_TEST_FILE_LIMIT:-}" ]; then
  ulimit -f "$ZEUS_WORKSPACE_TEST_FILE_LIMIT"
fi
archive="$ZEUS_WORKSPACE_ARCHIVE"
candidate=/data/.zeus-workspace-restore
rm -rf "$candidate"
mkdir -p "$candidate"
if tar --help 2>&1 | grep -q -- '--no-same-owner'; then
  tar -xzf "$archive" -C "$candidate" --strip-components=1 --no-same-permissions --no-same-owner
else
  tar -xzf "$archive" -C "$candidate" --strip-components=1 --no-same-permissions -o
fi
if [ "\${ZEUS_WORKSPACE_TEST_CRASH_AFTER:-}" = "extract" ]; then
  echo "injected abrupt exit after extraction" >&2
  exit 137
fi
if [ "\${ZEUS_WORKSPACE_TEST_PAUSE_AFTER:-}" = "extract" ]; then
  echo "paused after extraction" >&2
  sleep 600
fi
chown -R -h 10001:10001 "$candidate"
`

const ACCESS_SCRIPT = `
set -eu
root=/data/.zeus-workspace-restore
test -r "$root"
test -x "$root"
tmp="$root/.zeus-write-check-$$"
: > "$tmp"
rm -f "$tmp"
bad=$(find "$root" -type d ! -perm -700 -print -quit)
if [ -n "$bad" ]; then
  echo "directory is not owner-readable, writable and searchable: $bad" >&2
  exit 1
fi
bad=$(find "$root" -type f ! -perm -600 -print -quit)
if [ -n "$bad" ]; then
  echo "file is not owner-readable and writable: $bad" >&2
  exit 1
fi
find "$root" -type f -exec sh -c 'for f; do if ! test -r "$f"; then echo "unreadable file: $f" >&2; exit 1; fi; done' _ {} +
find "$root" -type d -exec sh -c 'for d; do if ! test -r "$d" || ! test -x "$d"; then echo "inaccessible directory: $d" >&2; exit 1; fi; done' _ {} +
`

const RECOVERY_SCRIPT = `
set -eu
data=/data
workspace="$data/workspace"
previous="$data/.zeus-workspace-previous"
candidate="$data/.zeus-workspace-restore"
state="$data/.zeus-workspace-restore.state"
phase=""
if [ -f "$state" ]; then
  phase=$(sed -n 's/^phase=//p' "$state" | head -n 1)
fi
action=none
restored=0
removed=0
interrupted=""
had_candidate=0
if [ -e "$candidate" ]; then
  had_candidate=1
fi
if [ -e "$previous" ]; then
  case "$phase" in
    switched|verified)
      if [ -e "$workspace" ]; then
        rm -rf "$previous"
        action=kept-switched-workspace
        removed=1
      else
        mv "$previous" "$workspace"
        action=restored-missing-workspace
        restored=1
      fi
      ;;
    *)
      if [ -e "$workspace" ]; then
        interrupted="$data/.zeus-workspace-restore-interrupted-$(date +%s)-$$"
        mv "$workspace" "$interrupted"
        action=moved-interrupted-aside
      fi
      mv "$previous" "$workspace"
      action="\${action:+$action,}restored-previous"
      restored=1
      ;;
  esac
elif [ -n "$phase" ] && [ ! -e "$workspace" ]; then
  case "$phase" in
    previous-moved|switched|verified)
      echo "interrupted AI workspace restore left no active workspace and no previous copy" >&2
      exit 1
      ;;
    *)
      action=missing-workspace-without-previous
      ;;
  esac
fi
rm -rf "$candidate"
rm -f "$state"
if [ "$action" = none ] && [ "$had_candidate" = 1 ]; then
  action=discarded-unswitched-candidate
fi
printf 'action=%s\\nrestored=%s\\nremoved=%s\\ninterrupted=%s\\n' "$action" "$restored" "$removed" "$interrupted"
`

const SWITCH_SCRIPT = `
set -eu
data=/data
workspace="$data/workspace"
previous="$data/.zeus-workspace-previous"
candidate="$data/.zeus-workspace-restore"
state="$data/.zeus-workspace-restore.state"
write_state() {
  printf 'phase=%s\\n' "$1" > "$state.tmp"
  mv "$state.tmp" "$state"
}
write_state prepared
if [ -e "$workspace" ]; then
  rm -rf "$previous"
  if ! mv "$workspace" "$previous"; then
    echo "failed to move the active workspace aside" >&2
    exit 1
  fi
fi
write_state previous-moved
if [ "\${ZEUS_WORKSPACE_TEST_CRASH_AFTER:-}" = "previous-moved" ]; then
  echo "injected abrupt exit after moving the previous workspace" >&2
  exit 137
fi
if [ "\${ZEUS_WORKSPACE_TEST_PAUSE_AFTER:-}" = "previous-moved" ]; then
  echo "paused after moving the previous workspace" >&2
  sleep 600
fi
if ! mv "$candidate" "$workspace"; then
  echo "failed to move the prepared workspace into place" >&2
  if [ -e "$previous" ]; then
    if mv "$previous" "$workspace"; then
      rm -f "$state"
      echo "restored the previous workspace after a failed switch" >&2
    else
      echo "failed to restore the previous workspace; manual intervention required" >&2
    fi
  fi
  exit 1
fi
write_state switched
if [ "\${ZEUS_WORKSPACE_TEST_CRASH_AFTER:-}" = "switched" ]; then
  echo "injected abrupt exit after the workspace switch" >&2
  exit 137
fi
if [ "\${ZEUS_WORKSPACE_TEST_PAUSE_AFTER:-}" = "switched" ]; then
  echo "paused after the workspace switch" >&2
  sleep 600
fi
if [ "\${ZEUS_WORKSPACE_TEST_CORRUPT_AFTER_SWITCH:-}" = "1" ]; then
  find "$workspace" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  echo "injected workspace corruption after the switch" >&2
fi
`

const CLEANUP_SCRIPT = `
set -eu
state=/data/.zeus-workspace-restore.state
printf 'phase=verified\\n' > "$state.tmp"
mv "$state.tmp" "$state"
rm -rf /data/.zeus-workspace-previous
rm -f "$state"
`

const SWITCH_ROLLBACK_SCRIPT = `
set -eu
data=/data
workspace="$data/workspace"
previous="$data/.zeus-workspace-previous"
interrupted="$data/.zeus-workspace-restore-failed-$(date +%s)-$$"
state="$data/.zeus-workspace-restore.state"
if [ -e "$workspace" ]; then
  mv "$workspace" "$interrupted"
fi
if [ -e "$previous" ]; then
  mv "$previous" "$workspace"
else
  echo "no previous workspace is available for rollback" >&2
  exit 1
fi
rm -f "$state"
printf 'interrupted=%s\\n' "$interrupted"
`

const TREE_MANIFEST_SCRIPT = `
set -eu
cd "$ZEUS_WORKSPACE_ROOT"
find . -mindepth 1 -print0 | while IFS= read -r -d '' p; do
  if [ -L "$p" ]; then
    t=l
  elif [ -d "$p" ]; then
    t=d
  elif [ -f "$p" ]; then
    t=f
  else
    t=o
  fi
  printf '%s%s\\0' "$t" "$p"
done
find . -mindepth 1 -type l -print0 | while IFS= read -r -d '' p; do
  printf 't%s\\0' "$p"
  readlink -n "$p" || exit 1
  printf '\\0'
done
`

export function restoreWorkspaceArchive(
  input: WorkspaceRestoreInput,
): WorkspaceRestoreResult {
  const { archive, dataDir, image } = input
  if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) {
    throw new Error(`AI workspace data directory does not exist: ${dataDir}`)
  }
  if (!fs.existsSync(archive.file)) {
    throw new Error(`AI workspace archive is missing: ${archive.file}`)
  }
  if (!fs.statSync(archive.file).isFile()) {
    throw new Error(
      `AI workspace archive is not a regular file: ${archive.file}`,
    )
  }

  // Repair a half-finished previous attempt before doing anything else. If
  // the old workspace is parked in `.zeus-workspace-previous`, it must become
  // active again even when the new archive later turns out to be corrupt.
  const recovery = recoverInterruptedWorkspaceRestore({
    dataDir,
    image,
    ...(input.hooks ? { hooks: input.hooks } : {}),
  })

  const expectedSha256 = archive.sha256.trim().toLowerCase()
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new Error(
      `AI workspace archive has an invalid checksum in deployment state: ${archive.sha256}`,
    )
  }
  const actualSha256 = sha256File(archive.file).toLowerCase()
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `AI workspace archive checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`,
    )
  }
  if (!Number.isInteger(archive.entries) || archive.entries < 1) {
    throw new Error('AI workspace archive metadata has an invalid entry count')
  }

  const names = dockerOrThrow(
    'AI workspace archive cannot be listed',
    workspaceContainer(input, ARCHIVE_PREFLIGHT_SCRIPT, {
      user: '0',
      archive: archive.file,
      dataReadOnly: true,
    }),
  )
  const verbose = dockerOrThrow(
    'AI workspace archive cannot be inspected',
    workspaceContainer(input, ARCHIVE_VERBOSE_SCRIPT, {
      user: '0',
      archive: archive.file,
      dataReadOnly: true,
    }),
  )
  const expected = parseWorkspaceArchiveEntries(names.stdout, verbose.stdout)
  if (expected.entryCount !== archive.entries) {
    throw new Error(
      `AI workspace archive entry count mismatch: backup metadata says ${archive.entries}, archive contains ${expected.entryCount}`,
    )
  }

  dockerOrThrow(
    'preparing the AI workspace candidate failed',
    workspaceContainer(input, EXTRACT_SCRIPT, {
      user: '0',
      archive: archive.file,
      ...(input.hooks?.crashAfter
        ? { crashAfter: input.hooks.crashAfter }
        : {}),
      ...(input.hooks?.pauseAfter
        ? { pauseAfter: input.hooks.pauseAfter }
        : {}),
      ...(input.hooks?.containerName
        ? { containerName: input.hooks.containerName }
        : {}),
      ...(input.hooks?.extractFileLimitBlocks
        ? { fileLimitBlocks: input.hooks.extractFileLimitBlocks }
        : {}),
    }),
  )
  dockerOrThrow(
    'the prepared AI workspace is not readable and writable by uid 10001',
    workspaceContainer(input, ACCESS_SCRIPT, { user: '10001:10001' }),
  )

  const candidateManifest = readWorkspaceManifest(input, 'candidate')
  const candidateProblems = compareWorkspaceManifests(
    expected.manifest,
    candidateManifest,
  )
  if (candidateProblems.length > 0) {
    throw new Error(
      `extracted AI workspace failed content verification before the switch: ${candidateProblems.join('; ')}`,
    )
  }

  dockerOrThrow(
    'switching to the restored AI workspace failed',
    workspaceContainer(input, SWITCH_SCRIPT, {
      user: '0',
      ...(input.hooks?.crashAfter
        ? { crashAfter: input.hooks.crashAfter }
        : {}),
      ...(input.hooks?.pauseAfter
        ? { pauseAfter: input.hooks.pauseAfter }
        : {}),
      ...(input.hooks?.containerName
        ? { containerName: input.hooks.containerName }
        : {}),
      ...(input.hooks?.corruptAfterSwitch ? { corruptAfterSwitch: true } : {}),
    }),
  )

  const warnings: string[] = []
  let activeManifest: WorkspaceTreeManifest
  try {
    activeManifest = readWorkspaceManifest(input, 'switched')
  } catch (error) {
    rollbackSwitchedWorkspace(
      input,
      `the active workspace manifest cannot be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  const problems = compareWorkspaceManifests(expected.manifest, activeManifest)
  if (problems.length > 0) {
    rollbackSwitchedWorkspace(
      input,
      `failed content verification: ${problems.join('; ')}`,
    )
  }

  const cleanup = workspaceContainer(input, CLEANUP_SCRIPT, { user: '0' })
  if (cleanup.status !== 0) {
    warnings.push(
      `the restored AI workspace is active and verified, but removing the previous workspace failed: ${describeDockerFailure(cleanup)}`,
    )
  }

  return {
    file: archive.file,
    sha256: actualSha256,
    entries: expected.entryCount,
    recovery,
    warnings,
  }
}

export function recoverInterruptedWorkspaceRestore(
  input: WorkspaceRecoveryInput,
): WorkspaceRecoveryResult {
  if (
    !fs.existsSync(input.dataDir) ||
    !fs.statSync(input.dataDir).isDirectory()
  ) {
    throw new Error(
      `AI workspace data directory does not exist: ${input.dataDir}`,
    )
  }
  const result = workspaceContainer(input, RECOVERY_SCRIPT, { user: '0' })
  if (result.status !== 0) {
    throw new Error(
      `failed to recover an interrupted AI workspace restore: ${describeDockerFailure(result)}`,
    )
  }
  const action = readKey(result.stdout, 'action') ?? 'none'
  const interrupted = readKey(result.stdout, 'interrupted')
  const restoredPrevious = readKey(result.stdout, 'restored') === '1'
  const removedPrevious = readKey(result.stdout, 'removed') === '1'
  return {
    recovered:
      action !== 'none' &&
      action !== 'no-previous' &&
      action !== 'missing-workspace-without-previous',
    restoredPrevious,
    removedPrevious,
    ...(interrupted ? { interruptedDir: interrupted } : {}),
    action,
  }
}

export function parseWorkspaceArchiveEntries(
  namesOutput: string,
  verboseOutput: string,
): {
  readonly entryCount: number
  readonly manifest: ReadonlyMap<string, WorkspaceArchiveEntry>
} {
  const names = splitLines(namesOutput)
  const verbose = splitLines(verboseOutput)
  if (names.length === 0) {
    throw new Error('refusing to restore an empty AI workspace archive')
  }
  if (verbose.length !== names.length) {
    throw new Error(
      'AI workspace archive listing is inconsistent: cannot map entry types',
    )
  }

  const entries = new Map<string, WorkspaceArchiveEntry>()
  const symlinks = new Map<string, string>()
  let rootEntries = 0
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]!
    const line = verbose[index]!
    const kind = line[0]
    if (kind !== 'd' && kind !== '-' && kind !== 'l' && kind !== 'h') {
      throw new Error(
        `AI workspace archive contains an unsupported entry type: ${name}`,
      )
    }
    const normalized = normalizeArchiveName(name)
    let target: string | undefined
    if (kind === 'l') {
      target = parseSymlinkTarget(line, name)
    }
    if (normalized.relative === '') {
      rootEntries += 1
      if (kind !== 'd') {
        throw new Error('AI workspace archive root is not a directory')
      }
      if (rootEntries > 1) {
        throw new Error('AI workspace archive contains a duplicate root entry')
      }
      continue
    }
    if (entries.has(normalized.relative)) {
      throw new Error(
        `AI workspace archive contains a duplicate entry: ${normalized.relative}`,
      )
    }
    const type = kind === 'd' ? 'directory' : kind === 'l' ? 'symlink' : 'file'
    const entry: WorkspaceArchiveEntry = {
      path: normalized.relative,
      type,
      ...(target !== undefined ? { target } : {}),
    }
    entries.set(entry.path, entry)
    if (type === 'symlink') {
      symlinks.set(entry.path, target!)
    }
  }

  validateSymlinkTargets(symlinks)
  for (const entry of entries.values()) {
    assertNoSymlinkAncestor(entry.path, symlinks)
    assertNoNonDirectoryAncestor(entry.path, entries)
  }
  return { entryCount: names.length, manifest: entries }
}

function normalizeArchiveName(name: string): { relative: string } {
  if (name.includes('\0')) {
    throw new Error('AI workspace archive contains an entry with a NUL byte')
  }
  if (name.startsWith('/') || /^[A-Za-z]:[\\/]/.test(name)) {
    throw new Error(
      `AI workspace archive contains an absolute path: ${JSON.stringify(name)}`,
    )
  }
  const parts = name.split('/')
  if (parts[parts.length - 1] === '') parts.pop()
  if (parts.length === 0 || parts[0] !== ROOT_ENTRY) {
    throw new Error(
      `AI workspace archive entry is outside the workspace root: ${JSON.stringify(name)}`,
    )
  }
  const relative = parts.slice(1)
  for (const part of relative) {
    if (part === '' || part === '.' || part === '..') {
      throw new Error(
        `AI workspace archive contains an unsafe path: ${JSON.stringify(name)}`,
      )
    }
  }
  return { relative: relative.join('/') }
}

function parseSymlinkTarget(line: string, name: string): string {
  if (line.endsWith(name)) {
    throw new Error(
      `AI workspace archive symlink entry has no target: ${JSON.stringify(name)}`,
    )
  }
  const marker = `${name} -> `
  const index = line.indexOf(marker)
  if (index < 0) {
    throw new Error(
      `AI workspace archive symlink entry cannot be parsed: ${JSON.stringify(name)}`,
    )
  }
  const target = line.slice(index + marker.length)
  if (target === '') {
    throw new Error(
      `AI workspace archive symlink entry has an empty target: ${JSON.stringify(name)}`,
    )
  }
  if (target.startsWith('/') || /^[A-Za-z]:[\\/]/.test(target)) {
    throw new Error(
      `AI workspace archive symlink escapes the workspace root: ${JSON.stringify(name)} -> ${JSON.stringify(target)}`,
    )
  }
  return target
}

function validateSymlinkTargets(symlinks: ReadonlyMap<string, string>): void {
  for (const [link, target] of symlinks) {
    const resolved = resolveRelativePath(link, symlinks)
    if (resolved === undefined) {
      throw new Error(
        `AI workspace archive symlink escapes the workspace root: ${JSON.stringify(link)} -> ${JSON.stringify(target)}`,
      )
    }
  }
}

function assertNoSymlinkAncestor(
  relative: string,
  symlinks: ReadonlyMap<string, string>,
): void {
  const parts = relative.split('/')
  for (let index = 1; index < parts.length; index += 1) {
    const ancestor = parts.slice(0, index).join('/')
    if (symlinks.has(ancestor)) {
      throw new Error(
        `AI workspace archive writes through a symlinked directory: ${JSON.stringify(relative)}`,
      )
    }
  }
}

function assertNoNonDirectoryAncestor(
  relative: string,
  entries: ReadonlyMap<string, WorkspaceArchiveEntry>,
): void {
  const parts = relative.split('/')
  for (let index = 1; index < parts.length; index += 1) {
    const ancestor = parts.slice(0, index).join('/')
    const entry = entries.get(ancestor)
    if (entry && entry.type !== 'directory') {
      throw new Error(
        `AI workspace archive uses a non-directory as a parent: ${JSON.stringify(relative)}`,
      )
    }
  }
}

/**
 * Resolves a path through the archive's symlink map. Returns undefined when
 * the path would leave the workspace root or loops.
 */
export function resolveRelativePath(
  relative: string,
  symlinks: ReadonlyMap<string, string>,
): string | undefined {
  const queue = relative.split('/')
  const resolved: string[] = []
  let hops = 0
  while (queue.length > 0) {
    const part = queue.shift()!
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (resolved.length === 0) return undefined
      resolved.pop()
      continue
    }
    resolved.push(part)
    const key = resolved.join('/')
    const target = symlinks.get(key)
    if (target !== undefined) {
      hops += 1
      if (hops > MAX_SYMLINK_HOPS) return undefined
      resolved.pop()
      queue.unshift(...target.split('/'))
    }
  }
  return resolved.join('/')
}

interface WorkspaceTreeManifest {
  readonly entries: ReadonlyMap<string, WorkspaceEntryType>
  readonly symlinks: ReadonlyMap<string, string>
}

function rollbackSwitchedWorkspace(
  input: WorkspaceRestoreInput,
  detail: string,
): never {
  const rollback = workspaceContainer(input, SWITCH_ROLLBACK_SCRIPT, {
    user: '0',
  })
  if (rollback.status !== 0) {
    throw new Error(
      `restored AI workspace failed content verification (${detail}) and rolling back to the previous workspace also failed: ${describeDockerFailure(rollback)}`,
    )
  }
  const interrupted = readKey(rollback.stdout, 'interrupted')
  throw new Error(
    `restored AI workspace failed content verification (${detail}); the previous workspace was restored${
      interrupted ? ` and the rejected copy is at ${interrupted}` : ''
    }`,
  )
}

function readWorkspaceManifest(
  input: WorkspaceRestoreInput,
  root: 'candidate' | 'switched',
): WorkspaceTreeManifest {
  const workspaceRoot =
    root === 'candidate' ? '/data/.zeus-workspace-restore' : '/data/workspace'
  const result = workspaceContainer(input, TREE_MANIFEST_SCRIPT, {
    user: '0',
    dataReadOnly: true,
    env: { ZEUS_WORKSPACE_ROOT: workspaceRoot },
  })
  if (result.status !== 0) {
    throw new Error(
      `AI workspace ${root} manifest cannot be read: ${describeDockerFailure(result)}`,
    )
  }
  return parseTreeManifest(result.stdout)
}

export function parseTreeManifest(output: string): WorkspaceTreeManifest {
  const tokens = output.split('\0')
  if (tokens[tokens.length - 1] === '') tokens.pop()
  const entries = new Map<string, WorkspaceEntryType>()
  const symlinks = new Map<string, string>()
  let pendingTarget: string | undefined
  for (const token of tokens) {
    if (pendingTarget !== undefined) {
      symlinks.set(pendingTarget, token)
      pendingTarget = undefined
      continue
    }
    const kind = token[0]
    const relative = normalizeTreePath(token.slice(1))
    if (kind === 't') {
      pendingTarget = relative
      continue
    }
    if (kind !== 'd' && kind !== 'f' && kind !== 'l') {
      throw new Error(
        `AI workspace contains an unsupported entry type: ${JSON.stringify(relative)}`,
      )
    }
    if (entries.has(relative)) {
      throw new Error(
        `AI workspace contains a duplicate entry: ${JSON.stringify(relative)}`,
      )
    }
    entries.set(
      relative,
      kind === 'd' ? 'directory' : kind === 'l' ? 'symlink' : 'file',
    )
  }
  if (pendingTarget !== undefined) {
    throw new Error('AI workspace symlink manifest is truncated')
  }
  for (const link of symlinks.keys()) {
    if (entries.get(link) !== 'symlink') {
      throw new Error(
        `AI workspace symlink manifest is inconsistent: ${JSON.stringify(link)}`,
      )
    }
  }
  validateSymlinkTargets(symlinks)
  return { entries, symlinks }
}

function normalizeTreePath(value: string): string {
  if (value.startsWith('./')) return value.slice(2)
  if (value.startsWith('/')) {
    throw new Error(
      `AI workspace manifest contains an absolute path: ${JSON.stringify(value)}`,
    )
  }
  return value
}

function compareWorkspaceManifests(
  expected: ReadonlyMap<string, WorkspaceArchiveEntry>,
  actual: WorkspaceTreeManifest,
): string[] {
  const problems: string[] = []
  const expectedTree = expandWorkspaceEntries(expected)
  for (const [relative, type] of expectedTree) {
    const actualType = actual.entries.get(relative)
    if (actualType === undefined) {
      problems.push(`missing entry ${JSON.stringify(relative)}`)
    } else if (actualType !== type) {
      problems.push(
        `entry ${JSON.stringify(relative)} is ${actualType}, expected ${type}`,
      )
    }
    if (problems.length >= 5) return problems
  }
  for (const relative of actual.entries.keys()) {
    if (!expectedTree.has(relative)) {
      problems.push(`unexpected entry ${JSON.stringify(relative)}`)
      if (problems.length >= 5) return problems
    }
  }
  for (const [relative, entry] of expected) {
    if (entry.type !== 'symlink') continue
    const actualTarget = actual.symlinks.get(relative)
    if (actualTarget !== entry.target) {
      problems.push(
        `symlink ${JSON.stringify(relative)} points to ${JSON.stringify(actualTarget)}, expected ${JSON.stringify(entry.target)}`,
      )
    }
    if (problems.length >= 5) return problems
  }
  return problems
}

function expandWorkspaceEntries(
  entries: ReadonlyMap<string, WorkspaceArchiveEntry>,
): Map<string, WorkspaceEntryType> {
  const tree = new Map<string, WorkspaceEntryType>()
  for (const [relative, entry] of entries) {
    const parts = relative.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      const ancestor = parts.slice(0, index).join('/')
      if (!tree.has(ancestor)) tree.set(ancestor, 'directory')
    }
    tree.set(relative, entry.type)
  }
  return tree
}

function workspaceContainer(
  input: {
    readonly dataDir: string
    readonly image: string
    readonly hooks?: WorkspaceRestoreHooks
  },
  script: string,
  options: {
    readonly user: string
    readonly archive?: string
    readonly dataReadOnly?: boolean
    readonly env?: Record<string, string>
    readonly crashAfter?: string
    readonly pauseAfter?: string
    readonly containerName?: string
    readonly corruptAfterSwitch?: boolean
    readonly fileLimitBlocks?: number
  },
): DockerResult {
  const hooks = input.hooks
  const args = [
    'run',
    '--rm',
    '--network',
    'none',
    '--user',
    options.user,
    '-v',
    `${input.dataDir}:/data${options.dataReadOnly || hooks?.dataReadOnly ? ':ro' : ''}`,
  ]
  if (options.archive) {
    args.push('-v', `${options.archive}:/backup/ai-workspace.tgz:ro`)
    args.push('-e', 'ZEUS_WORKSPACE_ARCHIVE=/backup/ai-workspace.tgz')
  }
  for (const volume of hooks?.extraVolumes ?? []) {
    args.push('-v', volume)
  }
  if (hooks?.pathPrefix) {
    args.push('-e', `PATH=${hooks.pathPrefix}:${DEFAULT_PATH}`)
  }
  for (const [key, value] of Object.entries(options.env ?? {})) {
    args.push('-e', `${key}=${value}`)
  }
  if (options.crashAfter) {
    args.push('-e', `ZEUS_WORKSPACE_TEST_CRASH_AFTER=${options.crashAfter}`)
  }
  if (options.pauseAfter) {
    args.push('-e', `ZEUS_WORKSPACE_TEST_PAUSE_AFTER=${options.pauseAfter}`)
  }
  if (options.fileLimitBlocks) {
    args.push('-e', `ZEUS_WORKSPACE_TEST_FILE_LIMIT=${options.fileLimitBlocks}`)
  }
  if (options.corruptAfterSwitch) {
    args.push('-e', 'ZEUS_WORKSPACE_TEST_CORRUPT_AFTER_SWITCH=1')
  }
  if (options.containerName) {
    args.push('--name', options.containerName)
  }
  args.push('--entrypoint', 'sh', input.image, '-c', script)
  return runDocker(args)
}

function dockerOrThrow(stage: string, result: DockerResult): DockerResult {
  if (result.status !== 0) {
    throw new Error(`${stage}: ${describeDockerFailure(result)}`)
  }
  return result
}

function describeDockerFailure(result: DockerResult): string {
  if (result.error) return result.error.message
  if (result.status === null) {
    return `container terminated by ${result.signal ?? 'an unknown signal'}`
  }
  const detail = [result.stderr.trim(), result.stdout.trim()]
    .filter(Boolean)
    .join('\n')
  return `exit ${result.status}${detail ? `: ${detail}` : ''}`
}

function runDocker(args: readonly string[]): DockerResult {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  return {
    status: result.status,
    signal: result.signal,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    ...(result.error ? { error: result.error } : {}),
  }
}

function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function readKey(output: string, key: string): string | undefined {
  for (const line of splitLines(output)) {
    const separator = line.indexOf('=')
    if (separator < 0) continue
    if (line.slice(0, separator) === key) return line.slice(separator + 1)
  }
  return undefined
}
