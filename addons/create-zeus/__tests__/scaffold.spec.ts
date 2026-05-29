import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scaffold } from '../src/scaffold'

describe('create-zeus scaffold', () => {
  it('creates basic-ts project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zeus-'))

    await scaffold({
      root,
      projectName: 'my-app',
      template: 'basic-ts',
    })

    expect(existsSync(join(root, 'package.json'))).toBe(true)
    expect(existsSync(join(root, 'src/main.tsx'))).toBe(true)
    expect(existsSync(join(root, 'vite.config.ts'))).toBe(true)
    expect(existsSync(join(root, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(root, 'index.html'))).toBe(true)

    rmSync(root, {
      recursive: true,
      force: true,
    })
  })

  it('creates web-component-ts project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zeus-'))

    await scaffold({
      root,
      projectName: 'my-wc-app',
      template: 'web-component-ts',
    })

    expect(existsSync(join(root, 'package.json'))).toBe(true)
    expect(existsSync(join(root, 'src/main.tsx'))).toBe(true)
    expect(existsSync(join(root, 'vite.config.ts'))).toBe(true)
    expect(existsSync(join(root, 'index.html'))).toBe(true)

    rmSync(root, {
      recursive: true,
      force: true,
    })
  })

  it('normalizes project name as package name', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zeus-'))

    await scaffold({
      root,
      projectName: 'My App 123',
      template: 'basic-ts',
    })

    const packageJsonPath = join(root, 'package.json')
    const { readFileSync } = await import('node:fs')
    const json = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

    expect(json.name).toBe('my-app-123')

    rmSync(root, {
      recursive: true,
      force: true,
    })
  })

  it('overwrites existing directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zeus-'))

    // Create a file first
    await scaffold({
      root,
      projectName: 'first',
      template: 'basic-ts',
    })

    // Scaffold again (should overwrite)
    await scaffold({
      root,
      projectName: 'second',
      template: 'web-component-ts',
    })

    // Should have web-component-ts content
    const packageJsonPath = join(root, 'package.json')
    const { readFileSync } = await import('node:fs')
    const json = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    expect(json.name).toBe('second')

    rmSync(root, {
      recursive: true,
      force: true,
    })
  })
})
