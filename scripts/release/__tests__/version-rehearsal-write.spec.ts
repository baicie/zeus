/**
 * The write pass, tested for the properties a version switch needs.
 *
 * The previous implementation looped `writeFileSync` over the plan. Every test
 * below about failure would have passed vacuously against it, because a
 * partial write left no record to assert on. These tests exercise the
 * staging, promotion and rollback paths by making a real filesystem operation
 * fail rather than by mocking the write.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  applyVersionRehearsal,
  collectVersionRehearsal,
  reviewApplyGuard,
  writeVersionRehearsalPlan,
} from '../version-rehearsal'

const FIXED = ['@zeus-js/zeus', '@zeus-js/signal'] as const

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function writeJson(root: string, file: string, value: unknown): void {
  const absolute = path.join(root, file)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, JSON.stringify(value, null, 2) + '\n')
}

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-rehearsal-write-'))
  roots.push(root)
  writeJson(root, 'package.json', {
    name: 'root',
    version: '0.1.1-beta.20',
    private: true,
  })
  writeJson(root, 'packages/core/zeus/package.json', {
    name: '@zeus-js/zeus',
    version: '0.1.1-beta.20',
    dependencies: { '@zeus-js/signal': 'workspace:*' },
  })
  writeJson(root, 'packages/core/signal/package.json', {
    name: '@zeus-js/signal',
    version: '0.1.1-beta.20',
  })
  fs.writeFileSync(
    path.join(root, 'Cargo.toml'),
    '[workspace]\nmembers = ["crates/a"]\n\n[workspace.package]\nversion = "0.1.1-beta.0"\nedition = "2024"\n',
  )
  writeJson(root, 'packages/tooling/vite-plugin/package.json', {
    name: '@zeus-js/vite-plugin',
    version: '0.0.5',
  })
  writeJson(
    root,
    'packages/create/create-zeus/templates/basic-ts/package.json',
    {
      name: 'my-zeus-app',
      dependencies: {
        '@zeus-js/zeus': '0.1.1-beta.20',
        '@zeus-web/button': '0.1.0-beta.34',
        'left-pad': '1.3.0',
      },
      devDependencies: {
        '@zeus-js/vite-plugin': '0.0.5',
        typescript: '^5.0.0',
      },
    },
  )
  return root
}

function readVersion(root: string, file: string): string {
  return (
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as {
      version: string
    }
  ).version
}

describe('collecting a plan writes nothing', () => {
  it('leaves every file byte-identical', () => {
    const root = fixture()
    const before = fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    const plan = collectVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    expect(plan.files.length).toBeGreaterThan(0)
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(
      before,
    )
    expect(readVersion(root, 'packages/core/zeus/package.json')).toBe(
      '0.1.1-beta.20',
    )
  })
})

describe('the write pass', () => {
  /*
   * `@zeus-js/vite-plugin` has its own release line (`vite-plugin@*` tags,
   * `devtools-release.yml`) and stays at its current version across a Core
   * switch. Rewriting it here put the two halves of the repo out of step:
   * `create-zeus-versions` derives each template's vite-plugin pin from that
   * package's manifest, so the templates followed it to the Core RC while
   * every `@zeus-web/*` package still pinned the old one.
   */
  it('leaves the independently versioned vite-plugin alone', () => {
    const root = fixture()
    const plan = collectVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    expect(plan.files.map(file => file.file)).not.toContain(
      'packages/tooling/vite-plugin/package.json',
    )
    expect(readVersion(root, 'packages/tooling/vite-plugin/package.json')).toBe(
      '0.0.5',
    )
  })

  /*
   * The template pin is not a Core-version pin either. `create-zeus-versions`
   * reconciles it against the vite-plugin manifest, so rewriting it here made
   * precheck fail on a template this function had just written.
   */
  it('leaves create-zeus template vite-plugin pins alone', () => {
    const root = fixture()
    const plan = collectVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    const edits = plan.edits.filter(
      edit => edit.packageName === '@zeus-js/vite-plugin',
    )
    expect(edits).toEqual([])

    const template = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          'packages/create/create-zeus/templates/basic-ts/package.json',
        ),
        'utf8',
      ),
    ) as { devDependencies: Record<string, string> }
    expect(template.devDependencies['@zeus-js/vite-plugin']).toBe('0.0.5')
  })

  it('writes every planned file and reports them', () => {
    const root = fixture()
    const plan = collectVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    const outcome = writeVersionRehearsalPlan(plan)
    expect(outcome.failures).toEqual([])
    expect([...outcome.written].sort()).toEqual(
      plan.files.map(file => file.file).sort(),
    )
    expect(readVersion(root, 'package.json')).toBe('0.2.0-rc.0')
    expect(readVersion(root, 'packages/core/signal/package.json')).toBe(
      '0.2.0-rc.0',
    )
  })

  it('leaves no temporary files behind on success', () => {
    const root = fixture()
    const plan = collectVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    writeVersionRehearsalPlan(plan)
    const strays: string[] = []
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name)
        if (entry.isDirectory()) walk(absolute)
        else if (entry.name.includes('.zeus-rehearsal-')) strays.push(absolute)
      }
    }
    walk(root)
    expect(strays).toEqual([])
  })

  /*
   * Staging happens before any target is touched. Making the *plan's* first
   * file's directory read-only would block staging, and nothing should be
   * written.
   */
  it('writes nothing when staging fails', () => {
    const root = fixture()
    const plan = collectVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    /* Point a planned file at a path whose parent does not exist. */
    const broken = {
      ...plan,
      files: [
        ...plan.files.slice(0, 1),
        {
          ...plan.files[1]!,
          absoluteFile: path.join(root, 'nope/deep/x.json'),
        },
      ],
    }
    const outcome = writeVersionRehearsalPlan(broken)
    expect(outcome.failures.length).toBe(1)
    expect(outcome.failures[0]?.message).toMatch(/could not stage/)
    expect(outcome.written).toEqual([])
    expect(readVersion(root, 'package.json')).toBe('0.1.1-beta.20')
  })

  /*
   * A promotion failure must restore what already landed. The seam makes the
   * failure a real one at the operation the implementation calls, so the
   * rollback loop runs exactly as it would in production.
   */
  it('rolls back files that already landed when a later rename fails', () => {
    const root = fixture()
    const plan = collectVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    let renames = 0
    const outcome = writeVersionRehearsalPlan(plan, {
      writeFileSync: (file, data) => fs.writeFileSync(file, data),
      rmSync: file => fs.rmSync(file, { force: true }),
      renameSync: (from, to) => {
        renames += 1
        if (renames === 3) throw new Error('simulated rename failure')
        fs.renameSync(from, to)
      },
    })
    expect(outcome.failures.length).toBe(1)
    expect(outcome.failures[0]?.message).toMatch(/simulated rename failure/)
    expect(outcome.consistent).toBe(true)
    /*
     * Two files had landed before the third failed; both must be back to the
     * old version, and the ones after it were never touched.
     */
    for (const file of plan.files) {
      const text = fs.readFileSync(path.join(root, file.file), 'utf8')
      expect(text).not.toContain('0.2.0-rc.0')
    }
  })

  it('reports a rollback that itself failed rather than claiming success', () => {
    const root = fixture()
    const plan = collectVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    /*
     * The rollback now stages the original and renames it into place, so a
     * rollback failure is a staging failure on a `.rollback` temporary. That
     * is what this injects, which is a real failure mode (disk full) rather
     * than a synthetic one.
     */
    let renames = 0
    const outcome = writeVersionRehearsalPlan(plan, {
      rmSync: file => fs.rmSync(file, { force: true }),
      renameSync: (from, to) => {
        renames += 1
        if (renames === 3) throw new Error('simulated rename failure')
        fs.renameSync(from, to)
      },
      writeFileSync: (file, data) => {
        if (file.includes('.rollback')) {
          throw new Error('simulated rollback failure')
        }
        fs.writeFileSync(file, data)
      },
    })
    expect(
      outcome.failures.some(failure => /rollback failed/.test(failure.message)),
    ).toBe(true)
    expect(outcome.consistent).toBe(false)
    expect(outcome.restoredAny).toBe(false)
  })
})

describe('applyVersionRehearsal', () => {
  it('throws rather than returning a partial report', () => {
    const root = fixture()
    const originalRename = fs.renameSync
    let calls = 0
    ;(fs as unknown as { renameSync: typeof fs.renameSync }).renameSync = (
      from: fs.PathLike,
      to: fs.PathLike,
    ) => {
      calls += 1
      if (calls === 2) throw new Error('simulated rename failure')
      return originalRename(from, to)
    }
    try {
      expect(() =>
        applyVersionRehearsal({
          root,
          version: '0.2.0-rc.0',
          fixedPackages: FIXED,
        }),
      ).toThrow(/version rehearsal write failed/)
    } finally {
      ;(fs as unknown as { renameSync: typeof fs.renameSync }).renameSync =
        originalRename
    }
  })

  it('is idempotent: a second run makes no edits', () => {
    const root = fixture()
    applyVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    const second = collectVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    expect(second.edits).toEqual([])
    expect(second.files).toEqual([])
  })
})

/*
 * The git guards. `--apply` used to run unconditionally, which is how a
 * rehearsal rewrote a real `main` checkout.
 */
describe('the apply guard', () => {
  function gitRepo(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-guard-'))
    roots.push(root)
    const run = (args: string[]): void => {
      execFileSync('git', args, { cwd: root, stdio: 'ignore' })
    }
    run(['init', '-q'])
    run(['config', 'user.email', 'test@example.com'])
    run(['config', 'user.name', 'test'])
    fs.writeFileSync(path.join(root, 'a.txt'), 'a\n')
    run(['add', '.'])
    run(['commit', '-q', '-m', 'init'])
    return root
  }

  it('refuses a directory that is not a git worktree', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-nogit-'))
    roots.push(root)
    expect(reviewApplyGuard(root)).toMatch(/not a git worktree/)
  })

  it('refuses main', { timeout: 30_000 }, () => {
    const root = gitRepo()
    execFileSync('git', ['branch', '-M', 'main'], {
      cwd: root,
      stdio: 'ignore',
    })
    expect(reviewApplyGuard(root)).toMatch(
      /refusing to rewrite versions on main/,
    )
  })

  /*
   * `--abbrev-ref HEAD` prints `HEAD` on a detached checkout, which equals no
   * branch name. A detached worktree on a `main` commit therefore passed the
   * guard, and `git checkout <sha>` is exactly how a rehearsal starts.
   */
  it('refuses a detached HEAD', { timeout: 30_000 }, () => {
    const root = gitRepo()
    execFileSync('git', ['checkout', '-q', '--detach', 'HEAD'], {
      cwd: root,
      stdio: 'ignore',
    })
    expect(reviewApplyGuard(root)).toMatch(/detached HEAD/)
  })

  it('refuses a dirty worktree', { timeout: 30_000 }, () => {
    const root = gitRepo()
    execFileSync('git', ['checkout', '-q', '-b', 'candidate'], {
      cwd: root,
      stdio: 'ignore',
    })
    fs.writeFileSync(path.join(root, 'a.txt'), 'changed\n')
    expect(reviewApplyGuard(root)).toMatch(/uncommitted changes/)
  })

  it('allows a clean candidate branch', { timeout: 30_000 }, () => {
    const root = gitRepo()
    execFileSync('git', ['checkout', '-q', '-b', 'candidate'], {
      cwd: root,
      stdio: 'ignore',
    })
    expect(reviewApplyGuard(root)).toBeUndefined()
  })

  /*
   * `--allow-non-git` exists for a scratch directory that is not a checkout.
   * Gating the whole guard on it also skipped the main and cleanliness checks,
   * so `--apply --allow-non-git` rewrote a clean `main` checkout.
   */
  it(
    'keeps the branch check when the worktree check is waived',
    { timeout: 30_000 },
    () => {
      const root = gitRepo()
      execFileSync('git', ['branch', '-M', 'main'], {
        cwd: root,
        stdio: 'ignore',
      })
      expect(reviewApplyGuard(root, { allowNonGit: true })).toMatch(
        /refusing to rewrite versions on main/,
      )
    },
  )

  it('waives only the worktree check', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-nogit2-'))
    roots.push(root)
    expect(reviewApplyGuard(root, { allowNonGit: true })).toBeUndefined()
  })

  it(
    'does not delete untracked files it did not create',
    { timeout: 30_000 },
    () => {
      const root = gitRepo()
      execFileSync('git', ['checkout', '-q', '-b', 'candidate'], {
        cwd: root,
        stdio: 'ignore',
      })
      fs.writeFileSync(path.join(root, 'notes.txt'), 'mine\n')
      /*
       * An untracked file does not block the switch — the rehearsal never
       * writes to it, and reverting the bump leaves it where it was. What
       * matters is that the guard does not remove it, which is asserted by
       * its continued existence rather than by a refusal.
       */
      expect(reviewApplyGuard(root)).toBeUndefined()
      expect(fs.existsSync(path.join(root, 'notes.txt'))).toBe(true)

      /* A tracked modification is a different matter: reverting would lose it. */
      fs.writeFileSync(path.join(root, 'a.txt'), 'modified\n')
      expect(reviewApplyGuard(root)).toMatch(/tracked files/)
    },
  )
})
