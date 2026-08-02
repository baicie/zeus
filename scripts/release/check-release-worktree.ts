import pico from 'picocolors'

import {
  captureReleaseWorktreeSnapshot,
  findUnexpectedReleaseWorktreeChanges,
  loadReleaseWorktreeSnapshot,
  removeReleaseWorktreeSnapshot,
  saveReleaseWorktreeSnapshot,
} from './release-worktree'

const action = process.argv[2]

if (action === '--capture') {
  saveReleaseWorktreeSnapshot(
    process.cwd(),
    captureReleaseWorktreeSnapshot(process.cwd()),
  )
  console.log(pico.green('Release worktree snapshot captured.'))
  process.exit(0)
}

if (action !== '--verify') {
  console.error('Usage: pnpm check:release-worktree --capture|--verify')
  process.exit(1)
}

const captured = loadReleaseWorktreeSnapshot(process.cwd())
removeReleaseWorktreeSnapshot(process.cwd())
const unexpected = findUnexpectedReleaseWorktreeChanges(process.cwd(), captured)

if (unexpected.length > 0) {
  console.error(pico.red('Release precheck changed unexpected files:'))
  for (const relativePath of unexpected) {
    console.error(`- ${relativePath}`)
  }
  process.exit(1)
}

console.log(pico.green('Release worktree check passed.'))
