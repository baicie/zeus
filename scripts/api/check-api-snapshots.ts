import { execSync } from 'node:child_process'

// Guard against running outside a git work tree.
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
  execSync('pnpm api:snapshot', {
    stdio: 'inherit',
  })

  // Compare the working tree against the index.
  //
  // This intentionally allows staged-only snapshot changes during local
  // development, but fails on any newly generated unstaged modification,
  // deletion, rename, or type change.
  const unstagedFiles = execSync('git diff --name-only -- docs/api/snapshots', {
    encoding: 'utf-8',
  }).trim()

  // `git diff` does not include untracked files, so check them separately.
  const untrackedFiles = execSync(
    'git ls-files --others --exclude-standard -- docs/api/snapshots',
    {
      encoding: 'utf-8',
    },
  ).trim()

  if (unstagedFiles || untrackedFiles) {
    const status = execSync('git status --porcelain -- docs/api/snapshots', {
      encoding: 'utf-8',
    })

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
