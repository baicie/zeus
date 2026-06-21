import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkZeusPackageVersions } from './check-zeus-package-versions'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    })
  }
})

describe('checkZeusPackageVersions', () => {
  it('passes when all public @zeus-js packages are aligned and fixed', () => {
    const root = createTempRoot()

    writePackage(root, 'packages/core/zeus/package.json', {
      name: '@zeus-js/zeus',
      version: '0.1.0-beta.6',
    })

    writePackage(root, 'packages/web-c/web-c-runtime/package.json', {
      name: '@zeus-js/web-c-runtime',
      version: '0.1.0-beta.6',
    })

    writePackage(root, 'packages/web-c/output-wc/package.json', {
      name: '@zeus-js/output-wc',
      version: '0.1.0-beta.6',
    })

    const result = checkZeusPackageVersions({
      root,
      fixedPackages: [
        '@zeus-js/zeus',
        '@zeus-js/web-c-runtime',
        '@zeus-js/output-wc',
      ],
    })

    expect(result).toEqual({
      ok: true,
      expectedVersion: '0.1.0-beta.6',
      problems: [],
    })
  })

  it('fails when a package version drifts from @zeus-js/zeus', () => {
    const root = createTempRoot()

    writePackage(root, 'packages/core/zeus/package.json', {
      name: '@zeus-js/zeus',
      version: '0.1.0-beta.6',
    })

    writePackage(root, 'packages/web-c/web-c-runtime/package.json', {
      name: '@zeus-js/web-c-runtime',
      version: '0.2.0',
    })

    const result = checkZeusPackageVersions({
      root,
      fixedPackages: ['@zeus-js/zeus', '@zeus-js/web-c-runtime'],
    })

    expect(result.ok).toBe(false)
    expect(result.expectedVersion).toBe('0.1.0-beta.6')
    expect(result.problems).toContainEqual({
      type: 'version-mismatch',
      packageName: '@zeus-js/web-c-runtime',
      version: '0.2.0',
      expectedVersion: '0.1.0-beta.6',
      file: path.normalize('packages/web-c/web-c-runtime/package.json'),
    })
  })

  it('ignores packages not in the fixed group', () => {
    const root = createTempRoot()

    writePackage(root, 'packages/core/zeus/package.json', {
      name: '@zeus-js/zeus',
      version: '0.1.0-beta.6',
    })

    writePackage(root, 'packages/web-c/web-c-runtime/package.json', {
      name: '@zeus-js/web-c-runtime',
      version: '0.2.0',
    })

    writePackage(root, 'packages/devtools/vite-plugin/package.json', {
      name: '@zeus-js/vite-plugin',
      version: '0.0.2',
    })

    const result = checkZeusPackageVersions({
      root,
      fixedPackages: ['@zeus-js/zeus'],
    })

    expect(result.ok).toBe(true)
  })

  it('fails when zeusFixedPackages references a package that does not exist', () => {
    const root = createTempRoot()

    writePackage(root, 'packages/core/zeus/package.json', {
      name: '@zeus-js/zeus',
      version: '0.1.0-beta.6',
    })

    const result = checkZeusPackageVersions({
      root,
      fixedPackages: ['@zeus-js/zeus', '@zeus-js/missing'],
    })

    expect(result.ok).toBe(false)
    expect(result.problems).toContainEqual({
      type: 'fixed-package-not-found',
      packageName: '@zeus-js/missing',
      expectedVersion: '0.1.0-beta.6',
    })
  })

  it('ignores private packages and non @zeus-js packages', () => {
    const root = createTempRoot()

    writePackage(root, 'packages/core/zeus/package.json', {
      name: '@zeus-js/zeus',
      version: '0.1.0-beta.6',
    })

    writePackage(root, 'packages/core/private-helper/package.json', {
      name: '@zeus-js/private-helper',
      version: '999.0.0',
      private: true,
    })

    writePackage(root, 'packages/core/external/package.json', {
      name: 'external-helper',
      version: '999.0.0',
    })

    const result = checkZeusPackageVersions({
      root,
      fixedPackages: ['@zeus-js/zeus'],
    })

    expect(result.ok).toBe(true)
  })
})

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-version-check-'))
  tempRoots.push(root)
  return root
}

function writePackage(
  root: string,
  relativePath: string,
  packageJson: Record<string, unknown>,
): void {
  const file = path.join(root, relativePath)

  fs.mkdirSync(path.dirname(file), {
    recursive: true,
  })

  fs.writeFileSync(file, `${JSON.stringify(packageJson, null, 2)}\n`)
}
