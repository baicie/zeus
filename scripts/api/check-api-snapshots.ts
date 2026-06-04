import { execSync } from 'node:child_process'

// Guard against running in a detached HEAD state (e.g. in a shallow clone
// used for building only) where `git diff` would fail.
try {
  execSync('git rev-parse --is-inside-work-tree', {
    stdio: 'pipe',
    encoding: 'utf-8',
  })
} catch {
  console.error('Not inside a git work tree. Skipping API snapshot check.')
  process.exit(0)
}

try {
  execSync('pnpm api:snapshot', { stdio: 'inherit' })

  const status = execSync('git status --porcelain -- docs/api/snapshots', {
    encoding: 'utf-8',
  })

  // Only fail on unstaged changes (working tree differs from staged/index).
  // Staged changes ("M " with leading space) represent snapshots that have been
  // updated and staged but not yet committed — this is the expected state after
  // running api:snapshot during development.
  // Unstaged changes (" M" with trailing space) represent snapshots that were
  // modified but not staged — this would indicate api:snapshot is producing
  // non-idempotent output.
  // Untracked files ("??") are never expected.
  const unstaged = status.split('\n').filter(line => {
    if (!line.trim()) return false
    // Unstaged: " M" (modified in worktree vs staged), "?? " (untracked)
    // Staged: "M " (staged vs HEAD)
    return line.startsWith(' M') || line.startsWith('??')
  })

  if (unstaged.length > 0) {
    console.error('\nPublic API snapshot changed (unstaged).\n')
    console.error(
      'If this is intentional, commit updated docs/api/snapshots files.',
    )
    console.error(
      'If this is breaking, add a major changeset and migration notes.\n',
    )
    console.error(status)

    const diff = execSync('git diff -- docs/api/snapshots', {
      encoding: 'utf-8',
    })

    if (diff.trim()) {
      console.error(diff)
    }

    process.exit(1)
  }

  console.log('API snapshots are up to date.')
} catch (err) {
  console.error(err)
  process.exit(1)
}
