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

/**
 * What a release checkout must not be allowed to carry.
 *
 * The dirty check used `git status --untracked-files=no`, so a file that exists
 * on disk and is in no commit was invisible: the checkout reported clean while
 * the build would read code the approved SHA does not contain. These cases pin
 * the distinction between "ignored build output" (expected, must not fail) and
 * "untracked source" (must fail).
 */
describe('release pairing sees files the commit does not', () => {
  it('rejects an untracked source file', () => {
    const { root, commit } = fixture('0.2.0-rc.0')
    fs.writeFileSync(
      path.join(root, 'packages', 'button', 'unreleased.ts'),
      'export const smuggled = true\n',
    )
    const result = checkUiPairing({
      uiRoot: root,
      coreVersion: '0.2.0-rc.0',
      expectedUiCommit: commit!,
      requireCommit: true,
    })
    expect(
      result.mismatches.some(mismatch => mismatch.includes('unreleased.ts')),
      `an untracked source file must fail the pairing, got: ${JSON.stringify(result.mismatches)}`,
    ).toBe(true)
  })

  it('rejects an untracked file in a nested package directory', () => {
    const { root, commit } = fixture('0.2.0-rc.0')
    fs.mkdirSync(path.join(root, 'packages', 'primitives', 'dialog'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(root, 'packages', 'primitives', 'dialog', 'package.json'),
      JSON.stringify({ name: '@zeus-web/dialog', version: '0.2.0-rc.0' }),
    )
    const result = checkUiPairing({
      uiRoot: root,
      coreVersion: '0.2.0-rc.0',
      expectedUiCommit: commit!,
      requireCommit: true,
    })
    /*
     * Git collapses an entirely untracked directory into one `?? packages/`
     * entry, so the mismatch names the directory rather than the file. What
     * matters is that the pairing noticed there is uncommitted code at all.
     */
    expect(
      result.mismatches.some(
        mismatch =>
          mismatch.startsWith('UI checkout is dirty:') &&
          mismatch.includes('packages'),
      ),
      `a nested untracked package must fail the pairing, got: ${JSON.stringify(result.mismatches)}`,
    ).toBe(true)
  })

  it('does not fail on ignored build output', { timeout: 60_000 }, () => {
    const { root, commit } = fixture('0.2.0-rc.0')
    fs.writeFileSync(path.join(root, '.gitignore'), 'dist\nnode_modules\n')
    execFileSync('git', ['-C', root, 'add', '.gitignore'])
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'ignore'], {
      stdio: 'ignore',
    })
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
    // Build output that is correctly ignored must not be mistaken for smuggled
    // source; otherwise every release checkout fails after a local build.
    fs.mkdirSync(path.join(root, 'packages', 'button', 'dist'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(root, 'packages', 'button', 'dist', 'index.js'),
      'built\n',
    )
    const result = checkUiPairing({
      uiRoot: root,
      coreVersion: '0.2.0-rc.0',
      expectedUiCommit: head,
      requireCommit: true,
    })
    expect(
      result.mismatches.filter(mismatch => mismatch.includes('dist/index.js')),
    ).toEqual([])
    expect(commit).toBeTruthy()
  })

  it(
    'rejects a tracked modification and reports it',
    { timeout: 60_000 },
    () => {
      const { root, commit } = fixture('0.2.0-rc.0')
      fs.writeFileSync(
        path.join(root, 'packages', 'button', 'package.json'),
        JSON.stringify({ name: '@zeus-web/button', version: '0.2.0-rc.0' }),
      )
      const result = checkUiPairing({
        uiRoot: root,
        coreVersion: '0.2.0-rc.0',
        expectedUiCommit: commit!,
        requireCommit: true,
      })
      expect(
        result.mismatches.some(mismatch =>
          mismatch.startsWith('UI checkout is dirty:'),
        ),
      ).toBe(true)
    },
  )
})

describe('optional dependencies participate in pairing', () => {
  it(
    'rejects an optional @zeus-js dependency that drifts',
    { timeout: 60_000 },
    () => {
      const { root, commit } = fixture('0.2.0-rc.0')
      const manifestPath = path.join(root, 'packages', 'button', 'package.json')
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        optionalDependencies?: Record<string, string>
      }
      manifest.optionalDependencies = {
        '@zeus-js/runtime-dom': '0.1.1-beta.20',
      }
      fs.writeFileSync(manifestPath, JSON.stringify(manifest))
      execFileSync('git', ['-C', root, 'add', '-A'])
      execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'optional'], {
        stdio: 'ignore',
      })
      const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim()
      const result = checkUiPairing({
        uiRoot: root,
        coreVersion: '0.2.0-rc.0',
        expectedUiCommit: head,
        requireCommit: true,
      })
      expect(
        result.mismatches.some(mismatch =>
          mismatch.includes('@zeus-js/runtime-dom'),
        ),
        `optional dependencies must be paired too, got: ${JSON.stringify(result.mismatches)}`,
      ).toBe(true)
      expect(commit).toBeTruthy()
    },
  )
})

/**
 * The release workflow must publish the approved SHA, not whatever `main`
 * points at when the job happens to run.
 *
 * Read as text for the same reason the CI trigger tests are: the repository
 * carries no YAML parser for tests. These assert the three guarantees that
 * together make "the released UI is the approved UI" true, and each one has
 * been the failure mode somewhere in this project's history.
 */
describe('release.yml pins the approved UI commit', () => {
  const workflow = fs.readFileSync(
    path.resolve(import.meta.dirname, '../../../.github/workflows/release.yml'),
    'utf8',
  )

  /*
   * The UI commit comes from a committed pairing record, not from an approval
   * document and not from a branch. A record in the repository at a known path
   * is reviewable in the pull request that adds it; a document produced at
   * release time is reviewable by nobody.
   */
  it('takes the UI commit from the committed pairing record', () => {
    expect(workflow).toMatch(/release-pairing\/v\$\{\{/)
    expect(workflow).toMatch(
      /UI_COMMIT=\$\(node -p "require\('\.\/\$FILE'\)\.uiCommit"\)/,
    )
  })

  it('rejects a paired commit that is not a full SHA', () => {
    expect(workflow).toMatch(
      /if ! \[\[ "\$UI_COMMIT" =~ \^\[0-9a-f\]\{40\}\$ \]\]/,
    )
  })

  it('checks out that exact ref and re-verifies HEAD after checkout', () => {
    expect(workflow).toMatch(
      /ref: \$\{\{ steps\.pairing\.outputs\.ui-commit \}\}/,
    )
    expect(workflow).toMatch(
      /test "\$\(git -C temp\/zeus-ui rev-parse HEAD\)" = "\$\{\{ steps\.pairing\.outputs\.ui-commit \}\}"/,
    )
  })

  it('runs the pairing gate in release mode', () => {
    expect(workflow).toMatch(/check:ui-pairing[\s\S]{0,400}--require-commit/)
  })
})
