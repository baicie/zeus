import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCreateZeus } from '../src/cli'

const prompts = vi.hoisted(() => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  text: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
}))
vi.mock('@clack/prompts', () => ({
  ...prompts,
  isCancel: (value: unknown) => typeof value === 'symbol',
}))

describe('create-zeus CLI overwrite flow', () => {
  let sandbox: string
  let workspace: string
  let root: string

  beforeEach(() => {
    vi.clearAllMocks()
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'zeus-cli-')))
    workspace = join(sandbox, 'workspace')
    root = join(workspace, 'project')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'keep.txt'), 'original')
    vi.spyOn(process, 'cwd').mockReturnValue(workspace)
    prompts.text.mockResolvedValue('project')
    prompts.select.mockResolvedValue('basic-ts')
    prompts.confirm.mockResolvedValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(sandbox, { recursive: true, force: true })
  })

  it('refuses non-empty destinations by default without offering overwrite', async () => {
    await expect(runCreateZeus([])).rejects.toThrow('not empty')
    expect(prompts.select).not.toHaveBeenCalled()
    expect(prompts.confirm).not.toHaveBeenCalled()
    expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('original')
  })

  it.each([false, Symbol('cancel')])(
    'preserves files when the force confirmation is declined (%s)',
    async answer => {
      prompts.confirm.mockResolvedValue(answer)
      await runCreateZeus(['--force'])
      expect(prompts.confirm).toHaveBeenCalledWith({
        message: expect.stringContaining(
          `permanently deletes ALL contents of "${root}"`,
        ),
        initialValue: false,
      })
      expect(prompts.cancel).toHaveBeenCalled()
      expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('original')
    },
  )

  it('requires --force and an affirmative destructive confirmation before replacement', async () => {
    prompts.confirm.mockResolvedValue(true)
    await runCreateZeus(['--force'])
    expect(existsSync(join(root, 'keep.txt'))).toBe(false)
    expect(
      JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name,
    ).toBe('project')
    expect(prompts.outro).toHaveBeenCalled()
  })

  it('rejects protected paths before even prompting for deletion', async () => {
    prompts.text.mockResolvedValue('..')
    await expect(runCreateZeus(['--force'])).rejects.toThrow(
      'protected directory or ancestor',
    )
    expect(prompts.confirm).not.toHaveBeenCalled()
    expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('original')
  })

  it.each([false, true])(
    'rechecks files created during template selection (force: %s)',
    async force => {
      rmSync(join(root, 'keep.txt'))
      prompts.select.mockImplementation(async () => {
        writeFileSync(join(root, 'arrived.txt'), 'new file')
        return 'basic-ts'
      })
      if (force) {
        await runCreateZeus(['--force'])
        expect(prompts.confirm).toHaveBeenCalledWith(
          expect.objectContaining({ initialValue: false }),
        )
      } else {
        await expect(runCreateZeus([])).rejects.toThrow('not empty')
        expect(prompts.confirm).not.toHaveBeenCalled()
      }
      expect(readFileSync(join(root, 'arrived.txt'), 'utf8')).toBe('new file')
      expect(existsSync(join(root, 'package.json'))).toBe(false)
    },
  )

  it('rechecks the target after confirmation rather than following a replaced symlink', async () => {
    const victim = join(sandbox, 'victim')
    mkdirSync(victim)
    writeFileSync(join(victim, 'keep.txt'), 'victim data')
    prompts.confirm.mockImplementation(async () => {
      renameSync(root, `${root}-original`)
      symlinkSync(
        victim,
        root,
        process.platform === 'win32' ? 'junction' : 'dir',
      )
      return true
    })
    await expect(runCreateZeus(['--force'])).rejects.toThrow('symbolic link')
    expect(readFileSync(join(victim, 'keep.txt'), 'utf8')).toBe('victim data')
    expect(readFileSync(join(`${root}-original`, 'keep.txt'), 'utf8')).toBe(
      'original',
    )
  })

  it('rejects unknown options before starting prompts or touching files', async () => {
    await expect(runCreateZeus(['--unknown'])).rejects.toThrow('Unknown option')
    expect(prompts.intro).not.toHaveBeenCalled()
    expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('original')
  })
})
