import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assertCleanReleaseSource,
  restoreReleaseRewrite,
  snapshotReleaseRewrite,
} from '../release-rewrite-guard'

const roots: string[] = []

function createRepository(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'zeus-rewrite-guard-'))
  roots.push(root)
  git(root, ['init', '-q'])
  writeFileSync(path.join(root, 'package.json'), '{"version":"1.0.0"}\n')
  writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  mkdirSync(path.join(root, 'packages/core/zeus'), { recursive: true })
  writeFileSync(
    path.join(root, 'packages/core/zeus/package.json'),
    '{"name":"@zeus-js/zeus","version":"1.0.0"}\n',
  )
  writeFileSync(path.join(root, 'packages/core/zeus/index.ts'), 'export {}\n')
  git(root, ['add', '-A'])
  git(root, [
    '-c',
    'user.name=Zeus Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-m',
    'init',
  ])
  return root
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('release rewrite guard', { timeout: 20_000 }, () => {
  it('restores version rewrites and removes temporary files', () => {
    const root = createRepository()
    const snapshot = snapshotReleaseRewrite(root)
    expect(snapshot.dirtyPaths.size).toBe(0)

    writeFileSync(
      path.join(root, 'package.json'),
      '{"version":"1.0.1-canary"}\n',
    )
    writeFileSync(path.join(root, 'temporary.txt'), 'temporary\n')

    const restored = restoreReleaseRewrite(root, snapshot)

    expect(restored).toEqual(['package.json', 'temporary.txt'])
    expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(
      '{"version":"1.0.0"}\n',
    )
    expect(existsSync(path.join(root, 'temporary.txt'))).toBe(false)
  })

  it('restores both sides of a rename', () => {
    const root = createRepository()
    const snapshot = snapshotReleaseRewrite(root)
    renameSync(
      path.join(root, 'packages/core/zeus/index.ts'),
      path.join(root, 'packages/core/zeus/renamed.ts'),
    )

    restoreReleaseRewrite(root, snapshot)

    expect(
      readFileSync(path.join(root, 'packages/core/zeus/index.ts'), 'utf8'),
    ).toBe('export {}\n')
    expect(existsSync(path.join(root, 'packages/core/zeus/renamed.ts'))).toBe(
      false,
    )
  })

  it('never overwrites files that were dirty before the snapshot', () => {
    const root = createRepository()
    writeFileSync(path.join(root, 'package.json'), '{"version":"local"}\n')
    const snapshot = snapshotReleaseRewrite(root)
    writeFileSync(path.join(root, 'package.json'), '{"version":"rewritten"}\n')

    restoreReleaseRewrite(root, snapshot)

    expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(
      '{"version":"rewritten"}\n',
    )
  })

  it('rejects a dirty source before canary versioning', () => {
    const root = createRepository()
    writeFileSync(path.join(root, 'package.json'), '{"version":"local"}\n')
    const snapshot = snapshotReleaseRewrite(root)

    expect(() => assertCleanReleaseSource(snapshot, [])).toThrow(
      'Canary requires a clean source worktree',
    )
  })
})
