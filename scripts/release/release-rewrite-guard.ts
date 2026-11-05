import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'

export interface ReleaseRewriteSnapshot {
  readonly sourceCommit: string
  readonly dirtyPaths: ReadonlySet<string>
}

export function snapshotReleaseRewrite(cwd: string): ReleaseRewriteSnapshot {
  return {
    sourceCommit: git(cwd, ['rev-parse', 'HEAD']),
    dirtyPaths: new Set(listReleaseChanges(cwd)),
  }
}

/**
 * Restore only the files changed after the source snapshot. Files that were
 * already dirty before the release rewrite are left untouched, so a local
 * Cargo.toml or other user edit is never overwritten.
 */
export function restoreReleaseRewrite(
  cwd: string,
  snapshot: ReleaseRewriteSnapshot,
): string[] {
  const changed = listReleaseChanges(cwd).filter(
    file => !snapshot.dirtyPaths.has(file),
  )

  for (const relativePath of changed) {
    if (isTracked(cwd, relativePath)) {
      git(cwd, ['restore', '--source=HEAD', '--', relativePath])
    } else {
      rmSync(path.join(cwd, relativePath), { recursive: true, force: true })
    }
  }

  return changed
}

export function listReleaseChanges(cwd: string): string[] {
  const output = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '-z',
      '--untracked-files=all',
      // Report a rename as delete+add so both the original and destination
      // paths are restored or removed independently.
      '--no-renames',
    ],
    { cwd, encoding: 'utf8' },
  )
  const paths = output
    .split('\0')
    .filter(entry => entry.length >= 4)
    .map(entry => entry.slice(3))

  return [...new Set(paths)].sort()
}

function isTracked(cwd: string, relativePath: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

export function hasOnlyExpectedReleaseDirt(
  snapshot: ReleaseRewriteSnapshot,
  allowedPaths: readonly string[],
): boolean {
  return (
    snapshot.dirtyPaths.size === 0 ||
    [...snapshot.dirtyPaths].every(file => allowedPaths.includes(file))
  )
}

export function assertCleanReleaseSource(
  snapshot: ReleaseRewriteSnapshot,
  allowedPaths: readonly string[],
): void {
  if (!hasOnlyExpectedReleaseDirt(snapshot, allowedPaths)) {
    throw new Error(
      `Canary requires a clean source worktree before versioning; dirty paths: ${[
        ...snapshot.dirtyPaths,
      ].join(', ')}`,
    )
  }
}
