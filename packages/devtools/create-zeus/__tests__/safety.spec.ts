import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, parse } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { scaffold } from '../src/scaffold'
import { inspectScaffoldTarget } from '../src/target'

vi.mock('node:os', async importOriginal => {
  const original = await importOriginal<typeof import('node:os')>()
  return { ...original, homedir: vi.fn(original.homedir) }
})

describe('scaffold target safety with real filesystem entries', () => {
  let sandbox: string
  let cwd: string
  let home: string
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'zeus-safe-')))
    cwd = join(sandbox, 'workspace', 'nested')
    home = join(sandbox, 'home')
    mkdirSync(cwd, { recursive: true })
    mkdirSync(home)
    writeFileSync(join(home, 'keep.txt'), 'home data')
    writeFileSync(join(cwd, 'keep.txt'), 'workspace data')
    vi.spyOn(process, 'cwd').mockReturnValue(cwd)
    vi.mocked(homedir).mockReturnValue(home)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(sandbox, { recursive: true, force: true })
  })

  const create = (root: string, force = true, template = 'basic-ts') =>
    scaffold({ root, projectName: 'safe-project', template, force })

  it('requires explicit force for non-empty directories and preserves every existing file', async () => {
    const root = join(sandbox, 'project')
    mkdirSync(join(root, 'nested'), { recursive: true })
    writeFileSync(join(root, 'nested', 'keep.txt'), 'original')
    await expect(create(root, false)).rejects.toThrow('not empty')
    await expect(create(root, 'false' as unknown as boolean)).rejects.toThrow(
      'not empty',
    )
    expect(readFileSync(join(root, 'nested', 'keep.txt'), 'utf8')).toBe(
      'original',
    )
    expect(existsSync(join(root, 'package.json'))).toBe(false)
  })

  it('replaces an ordinary directory only when force is explicit', async () => {
    const root = join(sandbox, 'project')
    mkdirSync(root)
    writeFileSync(join(root, 'old.txt'), 'replace me')
    await create(root)
    expect(existsSync(join(root, 'old.txt'))).toBe(false)
    expect(
      JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name,
    ).toBe('safe-project')
  })

  it('creates missing nested directories and accepts an empty existing directory', async () => {
    await create(join(sandbox, 'new', 'nested'), false)
    const empty = join(sandbox, 'empty')
    mkdirSync(empty)
    await create(empty, false)
    expect(existsSync(join(empty, 'src/main.tsx'))).toBe(true)
  })

  it('refuses the filesystem root in its read-only check', () => {
    expect(() => inspectScaffoldTarget(parse(sandbox).root)).toThrow(
      'filesystem root',
    )
  })

  it('refuses cwd, cwd ancestors and user home even with force', async () => {
    for (const root of [cwd, dirname(cwd), home, sandbox]) {
      await expect(create(root)).rejects.toThrow(
        'protected directory or ancestor',
      )
    }
    expect(readFileSync(join(home, 'keep.txt'), 'utf8')).toBe('home data')
    expect(readFileSync(join(cwd, 'keep.txt'), 'utf8')).toBe('workspace data')
  })

  it.each(['directory', 'file'])(
    'refuses Git repository roots with a .git %s',
    async kind => {
      const root = join(sandbox, `repository-${kind}`)
      mkdirSync(root)
      if (kind === 'directory') mkdirSync(join(root, '.git'))
      else writeFileSync(join(root, '.git'), 'gitdir: ../worktree-metadata')
      writeFileSync(join(root, 'keep.txt'), 'repository data')
      await expect(create(root)).rejects.toThrow('Git repository root')
      expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe(
        'repository data',
      )
    },
  )

  it('refuses a target that would remove the template installation', () => {
    const installation = join(sandbox, 'installed-create-zeus')
    const template = join(installation, 'templates', 'basic-ts')
    mkdirSync(template, { recursive: true })
    expect(() => inspectScaffoldTarget(installation, [template])).toThrow(
      'protected directory or ancestor',
    )
    expect(() =>
      inspectScaffoldTarget(join(template, 'generated'), [template]),
    ).toThrow('inside the template installation')
    expect(existsSync(template)).toBe(true)
  })

  it('refuses Git metadata directories even when they are the direct target', async () => {
    const metadata = join(sandbox, 'repository', '.git')
    mkdirSync(metadata, { recursive: true })
    writeFileSync(join(metadata, 'keep.txt'), 'metadata')
    await expect(create(metadata)).rejects.toThrow('Git metadata path')
    expect(readFileSync(join(metadata, 'keep.txt'), 'utf8')).toBe('metadata')
  })

  it('refuses a symlink target, a linked parent and a dangling link', async () => {
    const real = join(sandbox, 'real')
    mkdirSync(real)
    writeFileSync(join(real, 'keep.txt'), 'linked data')
    const link = join(sandbox, 'linked')
    const dangling = join(sandbox, 'dangling')
    symlinkSync(real, link, linkType)
    symlinkSync(join(sandbox, 'missing'), dangling, linkType)
    for (const root of [link, join(link, 'new-project'), dangling]) {
      await expect(create(root)).rejects.toThrow('symbolic link')
    }
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(real, 'keep.txt'), 'utf8')).toBe('linked data')
    expect(existsSync(join(real, 'new-project'))).toBe(false)
  })

  it('refuses existing files and template path traversal before changing the target', async () => {
    const root = join(sandbox, 'file.txt')
    writeFileSync(root, 'keep')
    await expect(create(root)).rejects.toThrow('not a directory')
    await expect(create(root, true, '../..')).rejects.toThrow('Template')
    await expect(create(root, true, 'unknown')).rejects.toThrow('Template')
    expect(readFileSync(root, 'utf8')).toBe('keep')
  })
})
