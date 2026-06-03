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

  const diff = execSync('git diff -- docs/api/snapshots', {
    encoding: 'utf-8',
  })

  if (diff.trim()) {
    console.error('\nPublic API snapshot changed.\n')
    console.error(
      'If this is intentional, commit updated docs/api/snapshots files.',
    )
    console.error(
      'If this is breaking, add a major changeset and migration notes.\n',
    )
    console.error(diff)
    process.exit(1)
  }

  console.log('API snapshots are up to date.')
} catch {
  process.exit(1)
}
