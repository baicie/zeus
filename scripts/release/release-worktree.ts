import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

export type ReleaseWorktreeSnapshot = Record<string, string>

const SNAPSHOT_FILE = 'zeus-release-worktree-snapshot.json'

export function captureReleaseWorktreeSnapshot(
  cwd: string,
): ReleaseWorktreeSnapshot {
  const worktreeRoot = getWorktreeRoot(cwd)
  const snapshot = Object.create(null) as ReleaseWorktreeSnapshot

  for (const relativePath of listWorktreeChanges(worktreeRoot)) {
    snapshot[relativePath] = hashWorktreePath(worktreeRoot, relativePath)
  }

  return snapshot
}

export function findUnexpectedReleaseWorktreeChanges(
  cwd: string,
  expected: ReleaseWorktreeSnapshot,
): string[] {
  const current = captureReleaseWorktreeSnapshot(cwd)
  const paths = new Set([...Object.keys(expected), ...Object.keys(current)])

  return [...paths]
    .filter(relativePath => expected[relativePath] !== current[relativePath])
    .sort()
}

export function saveReleaseWorktreeSnapshot(
  cwd: string,
  snapshot: ReleaseWorktreeSnapshot,
): void {
  writeFileSync(
    getReleaseWorktreeSnapshotPath(cwd),
    `${JSON.stringify(snapshot)}\n`,
  )
}

export function loadReleaseWorktreeSnapshot(
  cwd: string,
): ReleaseWorktreeSnapshot {
  const snapshotPath = getReleaseWorktreeSnapshotPath(cwd)
  if (!existsSync(snapshotPath)) {
    throw new Error(
      'Release worktree snapshot is missing. Run --capture first.',
    )
  }

  const parsed = JSON.parse(readFileSync(snapshotPath, 'utf8')) as unknown

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Invalid release worktree snapshot.')
  }

  for (const [relativePath, hash] of Object.entries(parsed)) {
    if (!relativePath || typeof hash !== 'string') {
      throw new Error('Invalid release worktree snapshot.')
    }
  }

  return parsed as ReleaseWorktreeSnapshot
}

export function removeReleaseWorktreeSnapshot(cwd: string): void {
  rmSync(getReleaseWorktreeSnapshotPath(cwd), { force: true })
}

export function getReleaseWorktreeSnapshotPath(cwd: string): string {
  const gitDir = runGit(cwd, ['rev-parse', '--absolute-git-dir']).trim()
  return path.join(gitDir, SNAPSHOT_FILE)
}

function getWorktreeRoot(cwd: string): string {
  return runGit(cwd, ['rev-parse', '--show-toplevel']).trim()
}

function listWorktreeChanges(cwd: string): string[] {
  const tracked = runGit(cwd, ['diff', '--name-only', '-z', 'HEAD'])
  const untracked = runGit(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ])

  return [
    ...new Set([
      ...parseNullSeparated(tracked),
      ...parseNullSeparated(untracked),
    ]),
  ].sort()
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function parseNullSeparated(value: string): string[] {
  return value.split('\0').filter(Boolean)
}

function hashWorktreePath(cwd: string, relativePath: string): string {
  const absolutePath = path.resolve(cwd, relativePath)

  if (!existsSync(absolutePath)) return 'deleted'

  const stats = lstatSync(absolutePath)
  const hash = createHash('sha256')
  hash.update(`${stats.mode & 0o111}:`)

  if (stats.isSymbolicLink()) {
    hash.update(`link:${readlinkSync(absolutePath)}`)
  } else {
    hash.update(readFileSync(absolutePath))
  }

  return hash.digest('hex')
}
