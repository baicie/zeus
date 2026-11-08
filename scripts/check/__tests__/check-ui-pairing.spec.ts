import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkUiPairing } from '../check-ui-pairing'

const roots: string[] = []

function fixture(
  dependency: string,
  options: { version?: string; git?: boolean } = {},
): { root: string; commit?: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-ui-pairing-'))
  roots.push(root)
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'zeus-ui',
      version: options.version ?? '0.2.0-rc.0',
    }),
  )
  fs.mkdirSync(path.join(root, 'packages', 'button'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'packages', 'button', 'package.json'),
    JSON.stringify({
      name: '@zeus-web/button',
      version: '0.2.0-rc.0',
      peerDependencies: { '@zeus-js/zeus': dependency },
    }),
  )
  if (options.git === false) return { root }
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  git('init', '-q')
  git('config', 'user.email', 'release@example.test')
  git('config', 'user.name', 'Release Test')
  git('add', '-A')
  git('commit', '-q', '-m', 'fixture')
  return { root, commit: git('rev-parse', 'HEAD') }
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('Core/UI pairing', { timeout: 30000 }, () => {
  it('passes when every UI package pins the exact Core candidate', () => {
    const result = checkUiPairing({
      uiRoot: fixture('0.2.0-rc.0').root,
      coreVersion: '0.2.0-rc.0',
    })
    expect(result.uiVersion).toBe('0.2.0-rc.0')
    expect(result.mismatches).toEqual([])
  })

  it('rejects an old beta pin and a missing UI checkout', () => {
    const result = checkUiPairing({
      uiRoot: fixture('0.1.1-beta.20').root,
      coreVersion: '0.2.0-rc.0',
    })
    expect(result.mismatches).toEqual([
      '@zeus-web/button: @zeus-js/zeus 0.1.1-beta.20 != 0.2.0-rc.0',
    ])
    expect(
      checkUiPairing({
        uiRoot: path.join(os.tmpdir(), 'zeus-ui-missing'),
        coreVersion: '0.2.0-rc.0',
      }).mismatches[0],
    ).toContain('UI checkout is missing')
  })

  it('accepts the exact approved commit and records the source tree SHA', () => {
    const { root, commit } = fixture('0.2.0-rc.0')
    const result = checkUiPairing({
      uiRoot: root,
      coreVersion: '0.2.0-rc.0',
      expectedUiCommit: commit!,
      expectedUiVersion: '0.2.0-rc.0',
      requireCommit: true,
    })
    expect(result.mismatches).toEqual([])
    expect(result.uiCommit).toBe(commit)
    expect(result.uiSourceTreeSha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('rejects the same version at a different commit', () => {
    const first = fixture('0.2.0-rc.0')
    fs.writeFileSync(
      path.join(first.root, 'packages', 'button', 'extra.txt'),
      'changed',
    )
    execFileSync('git', ['-C', first.root, 'add', '-A'])
    execFileSync('git', ['-C', first.root, 'commit', '-q', '-m', 'second'], {
      stdio: 'ignore',
    })
    const secondCommit = execFileSync(
      'git',
      ['-C', first.root, 'rev-parse', 'HEAD'],
      { encoding: 'utf8' },
    ).trim()

    const result = checkUiPairing({
      uiRoot: first.root,
      coreVersion: '0.2.0-rc.0',
      expectedUiCommit: first.commit!,
      expectedUiVersion: '0.2.0-rc.0',
      requireCommit: true,
    })
    expect(result.uiCommit).toBe(secondCommit)
    expect(result.mismatches).toContain(
      `UI commit ${secondCommit} != approved ${first.commit}`,
    )
  })

  it('rejects the same commit at the wrong version', () => {
    const { root, commit } = fixture('0.2.0-rc.0')
    const result = checkUiPairing({
      uiRoot: root,
      coreVersion: '0.2.0-rc.0',
      expectedUiCommit: commit!,
      expectedUiVersion: '0.2.0-rc.1',
      requireCommit: true,
    })
    expect(result.mismatches).toContain(
      'UI version 0.2.0-rc.0 != approved 0.2.0-rc.1',
    )
  })

  it('rejects a dirty release checkout and a missing approved commit', () => {
    const { root } = fixture('0.2.0-rc.0')
    fs.writeFileSync(path.join(root, 'packages', 'button', 'dirty.txt'), 'x')
    execFileSync('git', ['-C', root, 'add', '-A'])
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'dirty'], {
      stdio: 'ignore',
    })
    fs.appendFileSync(path.join(root, 'package.json'), '\n')

    const result = checkUiPairing({
      uiRoot: root,
      coreVersion: '0.2.0-rc.0',
      requireCommit: true,
    })
    expect(result.mismatches).toContain(
      'release pairing requires an approved UI commit',
    )
    expect(
      result.mismatches.some(mismatch =>
        mismatch.startsWith('UI checkout is dirty:'),
      ),
    ).toBe(true)
  })

  it('rejects a short approved commit and a wrong Core pin', () => {
    const { root, commit } = fixture('0.1.1-beta.20')
    const result = checkUiPairing({
      uiRoot: root,
      coreVersion: '0.2.0-rc.0',
      expectedUiCommit: commit!.slice(0, 12),
      requireCommit: true,
    })
    expect(result.mismatches).toContain(
      'approved UI commit must be a full 40-character SHA',
    )
    expect(result.mismatches).toContain(
      '@zeus-web/button: @zeus-js/zeus 0.1.1-beta.20 != 0.2.0-rc.0',
    )
  })
})
