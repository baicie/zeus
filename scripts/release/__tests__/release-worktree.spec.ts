import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  captureReleaseWorktreeSnapshot,
  findUnexpectedReleaseWorktreeChanges,
  loadReleaseWorktreeSnapshot,
  removeReleaseWorktreeSnapshot,
  saveReleaseWorktreeSnapshot,
} from '../release-worktree'

const tempDirs: string[] = []
let repositoryFixture = ''

beforeAll(() => {
  // Git process startup is costly under the full suite. Commit the common
  // baseline once, then copy it so every test still owns a real repository.
  repositoryFixture = mkdtempSync(
    join(tmpdir(), 'zeus-release-worktree-fixture-'),
  )
  execFileSync('git', ['init', '--quiet', '--template='], {
    cwd: repositoryFixture,
  })
  writeFileSync(
    join(repositoryFixture, 'package.json'),
    '{"version":"0.1.0-beta.9"}\n',
  )
  writeFileSync(
    join(repositoryFixture, 'pnpm-lock.yaml'),
    'lockfileVersion: 9\n',
  )
  execFileSync('git', ['add', '.'], { cwd: repositoryFixture })
  execFileSync(
    'git',
    [
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Zeus Test',
      '-c',
      'core.hooksPath=',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'test: initial fixture',
    ],
    { cwd: repositoryFixture },
  )
})

afterAll(() => {
  if (repositoryFixture) {
    rmSync(repositoryFixture, { force: true, recursive: true })
  }
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
})

// These are real Git integration tests, with up to ten subprocesses per case.
// Allow scheduling contention without raising the global unit-test timeout.
describe('release worktree guard', { timeout: 15_000 }, () => {
  it('rejects paths introduced after the release snapshot', () => {
    const cwd = createRepository()
    writeFileSync(join(cwd, 'package.json'), '{"version":"0.1.0"}\n')
    const snapshot = captureReleaseWorktreeSnapshot(cwd)

    mkdirSync(join(cwd, 'generated'))
    writeFileSync(join(cwd, 'generated/metadata.json'), '{}\n')

    expect(findUnexpectedReleaseWorktreeChanges(cwd, snapshot)).toEqual([
      'generated/metadata.json',
    ])
  })

  it('rejects a __proto__ path introduced after the release snapshot', () => {
    const cwd = createRepository()
    const snapshot = captureReleaseWorktreeSnapshot(cwd)

    writeFileSync(join(cwd, '__proto__'), 'generated\n')

    expect(findUnexpectedReleaseWorktreeChanges(cwd, snapshot)).toEqual([
      '__proto__',
    ])
  })

  it('rejects additional mutations to an expected release file', () => {
    const cwd = createRepository()
    writeFileSync(join(cwd, 'package.json'), '{"version":"0.1.0"}\n')
    const snapshot = captureReleaseWorktreeSnapshot(cwd)

    writeFileSync(
      join(cwd, 'package.json'),
      '{"version":"0.1.0","generated":true}\n',
    )

    expect(findUnexpectedReleaseWorktreeChanges(cwd, snapshot)).toEqual([
      'package.json',
    ])
  })

  it('rejects changing the target of a dangling symbolic link', () => {
    const cwd = createRepository()
    const linkPath = join(cwd, 'generated-link')
    symlinkSync('missing-before', linkPath)
    const snapshot = captureReleaseWorktreeSnapshot(cwd)

    rmSync(linkPath)
    symlinkSync('missing-after', linkPath)

    expect(findUnexpectedReleaseWorktreeChanges(cwd, snapshot)).toEqual([
      'generated-link',
    ])
  })

  it('distinguishes symbolic links from executable files', () => {
    const cwd = createRepository()
    const generatedPath = join(cwd, 'generated-entry')
    writeFileSync(join(cwd, 'target'), 'target\n')
    symlinkSync('target', generatedPath)
    const linkExecutableBits = lstatSync(generatedPath).mode & 0o111
    const snapshot = captureReleaseWorktreeSnapshot(cwd)

    rmSync(generatedPath)
    writeFileSync(generatedPath, 'link:target')
    chmodSync(generatedPath, 0o600 | linkExecutableBits)

    expect(findUnexpectedReleaseWorktreeChanges(cwd, snapshot)).toEqual([
      'generated-entry',
    ])
  })

  it('uses repository-relative paths when called from a subdirectory', () => {
    const repositoryRoot = createRepository()
    const cwd = join(repositoryRoot, 'packages')
    mkdirSync(cwd)
    writeFileSync(join(repositoryRoot, 'package.json'), '{"version":"0.1.0"}\n')
    const snapshot = captureReleaseWorktreeSnapshot(cwd)

    writeFileSync(
      join(repositoryRoot, 'package.json'),
      '{"version":"0.1.0","generated":true}\n',
    )

    expect(findUnexpectedReleaseWorktreeChanges(cwd, snapshot)).toEqual([
      'package.json',
    ])
  })

  it('accepts expected release files that remain unchanged', () => {
    const cwd = createRepository()
    writeFileSync(join(cwd, 'package.json'), '{"version":"0.1.0"}\n')
    const snapshot = captureReleaseWorktreeSnapshot(cwd)

    expect(findUnexpectedReleaseWorktreeChanges(cwd, snapshot)).toEqual([])
  })

  it('rejects lockfile mutations during precheck', () => {
    const cwd = createRepository()
    writeFileSync(join(cwd, 'package.json'), '{"version":"0.1.0"}\n')
    const snapshot = captureReleaseWorktreeSnapshot(cwd)

    writeFileSync(
      join(cwd, 'pnpm-lock.yaml'),
      'lockfileVersion: 9\nsettings:\n  autoInstallPeers: true\n',
    )

    expect(findUnexpectedReleaseWorktreeChanges(cwd, snapshot)).toEqual([
      'pnpm-lock.yaml',
    ])
  })

  it('persists the snapshot outside the worktree', () => {
    const cwd = createRepository()
    writeFileSync(join(cwd, 'package.json'), '{"version":"0.1.0"}\n')
    const snapshot = captureReleaseWorktreeSnapshot(cwd)

    saveReleaseWorktreeSnapshot(cwd, snapshot)

    expect(loadReleaseWorktreeSnapshot(cwd)).toEqual(snapshot)
    expect(captureReleaseWorktreeSnapshot(cwd)).toEqual(snapshot)

    removeReleaseWorktreeSnapshot(cwd)
    expect(() => loadReleaseWorktreeSnapshot(cwd)).toThrow(
      'Release worktree snapshot is missing',
    )
  })
})

function createRepository(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'zeus-release-worktree-'))
  tempDirs.push(cwd)
  cpSync(repositoryFixture, cwd, { recursive: true })

  return cwd
}
