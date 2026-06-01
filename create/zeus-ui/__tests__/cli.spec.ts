import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { vi, describe, expect, it, afterEach } from 'vitest'

import { addCommand } from '../src/commands/add'
import { initCommand } from '../src/commands/init'
import { listCommand } from '../src/commands/list'
import {
  readConfig,
  createDefaultConfig,
  writeConfig,
} from '../src/core/config'

vi.mock('../src/core/install', () => {
  return {
    detectPackageManager: () => Promise.resolve('pnpm'),
    installDependencies: vi.fn(),
  }
})

describe('zeus-ui init', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  async function withTmpDir(fn: (cwd: string) => Promise<void>) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-ui-'))
    tmpDirs.push(cwd)
    const old = process.cwd()
    process.chdir(cwd)
    try {
      await fn(cwd)
    } finally {
      process.chdir(old)
    }
  }

  it('creates config file with react framework', async () => {
    await withTmpDir(async () => {
      await fs.writeFileSync(
        path.join(process.cwd(), 'package.json'),
        JSON.stringify({ dependencies: { react: '^19.0.0' } }),
      )

      await initCommand({ yes: true, framework: 'react' })

      const config = await readConfig()
      expect(config?.framework).toBe('react')
      expect(config?.aliases.ui).toBe('@/components/ui')
    })
  })

  it('creates config file with vue framework', async () => {
    await withTmpDir(async () => {
      await fs.writeFileSync(
        path.join(process.cwd(), 'package.json'),
        JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      )

      await initCommand({ yes: true, framework: 'vue' })

      const config = await readConfig()
      expect(config?.framework).toBe('vue')
    })
  })

  it('creates utils.ts file', async () => {
    await withTmpDir(async () => {
      await initCommand({ yes: true, framework: 'react' })

      const utilsPath = path.join(process.cwd(), 'src/lib/utils.ts')
      expect(fs.existsSync(utilsPath)).toBe(true)
      const content = fs.readFileSync(utilsPath, 'utf-8')
      expect(content).toContain('twMerge')
      expect(content).toContain('clsx')
    })
  })

  it('creates theme.css file', async () => {
    await withTmpDir(async () => {
      await initCommand({ yes: true, framework: 'react' })

      const themePath = path.join(process.cwd(), 'src/styles/zeus-theme.css')
      expect(fs.existsSync(themePath)).toBe(true)
      const content = fs.readFileSync(themePath, 'utf-8')
      expect(content).toContain('--z-primary')
      expect(content).toContain('.dark')
    })
  })
})

describe('zeus-ui add', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  async function withTmpDir(fn: (cwd: string) => Promise<void>) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-ui-add-'))
    tmpDirs.push(cwd)
    const old = process.cwd()
    process.chdir(cwd)
    try {
      await fn(cwd)
    } finally {
      process.chdir(old)
    }
  }

  it('adds button component for react', async () => {
    await withTmpDir(async () => {
      await fs.writeFileSync(
        path.join(process.cwd(), 'package.json'),
        JSON.stringify({ dependencies: { react: '^19.0.0' } }),
      )

      await writeConfig(createDefaultConfig('react'), process.cwd())

      await addCommand(['button'], { yes: true })

      const buttonPath = path.join(
        process.cwd(),
        'src/components/ui/button.tsx',
      )
      expect(fs.existsSync(buttonPath)).toBe(true)
      const content = fs.readFileSync(buttonPath, 'utf-8')
      expect(content).toContain('@zeus-ui/headless/react')
      expect(content).toContain('buttonVariants')
    })
  })

  it('adds switch component for vue', async () => {
    await withTmpDir(async () => {
      await fs.writeFileSync(
        path.join(process.cwd(), 'package.json'),
        JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
      )

      await writeConfig(createDefaultConfig('vue'), process.cwd())

      await addCommand(['switch'], { yes: true })

      const switchPath = path.join(
        process.cwd(),
        'src/components/ui/Switch.vue',
      )
      expect(fs.existsSync(switchPath)).toBe(true)
    })
  })

  it('throws for unknown component', async () => {
    await withTmpDir(async () => {
      await fs.writeFileSync(
        path.join(process.cwd(), 'package.json'),
        JSON.stringify({ dependencies: { react: '^19.0.0' } }),
      )

      await writeConfig(createDefaultConfig('react'), process.cwd())

      await expect(addCommand(['nonexistent'], { yes: true })).rejects.toThrow(
        'Unknown component "nonexistent"',
      )
    })
  })

  it('transforms alias paths', async () => {
    await withTmpDir(async () => {
      await fs.writeFileSync(
        path.join(process.cwd(), 'package.json'),
        JSON.stringify({ dependencies: { react: '^19.0.0' } }),
      )

      const customConfig = createDefaultConfig('react')
      customConfig.aliases.lib = '@/utils'
      customConfig.aliases.ui = '@/components/ui'
      await writeConfig(customConfig, process.cwd())

      await addCommand(['button'], { yes: true })

      const buttonPath = path.join(
        process.cwd(),
        'src/components/ui/button.tsx',
      )
      const content = fs.readFileSync(buttonPath, 'utf-8')
      expect(content).toContain('@/utils')
    })
  })
})

describe('zeus-ui list', () => {
  it('lists all components', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await listCommand({})

    expect(consoleSpy).toHaveBeenCalled()
    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n')
    expect(output).toContain('button')
    expect(output).toContain('react')

    consoleSpy.mockRestore()
  })

  it('lists only react components', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await listCommand({ framework: 'react' })

    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n')
    expect(output).toContain('react')
    expect(output).not.toContain('\tvue\t')

    consoleSpy.mockRestore()
  })
})
