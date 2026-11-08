import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  CANDIDATE_TEMPLATES,
  applyCandidateManifest,
  collectWorkspaceClosure,
  discoverWorkspacePackages,
  templateOutputs,
  templatePinMismatches,
  templateOutputExists,
  toFileSpec,
} from '../create-zeus-candidate-matrix'

const roots: string[] = []

function temporary(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-candidate-'))
  roots.push(root)
  return root
}

function writePackage(
  root: string,
  relative: string,
  manifest: Record<string, unknown>,
): string {
  const directory = path.join(root, relative)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify(manifest),
  )
  return directory
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('create-zeus candidate matrix', () => {
  it('lists every template and its meaningful build output', () => {
    expect(CANDIDATE_TEMPLATES.map(template => template.name).sort()).toEqual([
      'admin-ts',
      'application-ts',
      'basic-ts',
      'component-library-ts',
      'web-component-ts',
      'webc-consumer-ts',
    ])
    expect(templateOutputs('basic-ts')).toEqual([
      'dist/index.html',
      'dist/assets/index-*.js',
    ])
    expect(templateOutputs('component-library-ts')).toEqual(
      expect.arrayContaining([
        'dist/custom-elements.json',
        'dist/zeus.components.json',
        'dist/wc/auto.js',
        'dist/wc/index.js',
        'dist/wc/z-greeting.entry.js',
        'dist/react/index.js',
        'dist/vue/index.js',
        'dist/assets/index-*.js',
      ]),
    )
    expect(() => templateOutputs('missing-ts')).toThrow(
      'unknown create-zeus template',
    )
  })

  it('discovers packages and follows the @zeus-web closure', () => {
    const root = temporary()
    writePackage(root, 'packages/primitives/button', {
      name: '@zeus-web/button',
      version: '0.1.0-beta.35',
      dependencies: { '@zeus-web/zeus-compat': 'workspace:*' },
    })
    writePackage(root, 'packages/zeus-compat', {
      name: '@zeus-web/zeus-compat',
      version: '0.1.0-beta.35',
      dependencies: { '@zeus-js/runtime-dom': '0.1.1-beta.20' },
    })
    const packages = discoverWorkspacePackages(root)
    expect([...packages.keys()].sort()).toEqual([
      '@zeus-web/button',
      '@zeus-web/zeus-compat',
    ])

    const closure = collectWorkspaceClosure(packages, ['@zeus-web/button'])
    expect(closure.map(item => item.name)).toEqual([
      '@zeus-web/button',
      '@zeus-web/zeus-compat',
    ])
  })

  it('rejects duplicate workspace names instead of gating the wrong directory', () => {
    const root = temporary()
    writePackage(root, 'packages/a', {
      name: '@zeus-web/dup',
      version: '1.0.0',
    })
    writePackage(root, 'packages/b', {
      name: '@zeus-web/dup',
      version: '2.0.0',
    })
    expect(() => discoverWorkspacePackages(root)).toThrow(
      'duplicate workspace package @zeus-web/dup',
    )
  })

  it('overrides every candidate without rewriting realistic template pins', () => {
    const candidates = new Map([
      ['@zeus-js/zeus', 'file:/tmp/zeus.tgz'],
      ['@zeus-js/signal', 'file:/tmp/signal.tgz'],
    ])
    const result = applyCandidateManifest(
      {
        dependencies: {
          '@zeus-js/zeus': '0.1.1-beta.20',
          react: '^19.2.7',
        },
        devDependencies: { '@zeus-js/vite-plugin': '0.0.5' },
      },
      candidates,
    )

    expect(result.manifest.dependencies).toEqual({
      '@zeus-js/zeus': '0.1.1-beta.20',
      react: '^19.2.7',
    })
    expect(result.direct).toEqual(['@zeus-js/zeus'])
    expect(result.manifest.pnpm).toMatchObject({
      overrides: {
        '@zeus-js/zeus': 'file:/tmp/zeus.tgz',
        '@zeus-js/signal': 'file:/tmp/signal.tgz',
      },
    })
  })

  it('reports every direct pin that differs from the candidate map', () => {
    const mismatches = templatePinMismatches(
      {
        dependencies: {
          '@zeus-js/zeus': '0.1.1-beta.20',
          '@zeus-web/button': '0.1.0-beta.34',
          react: '^19.2.7',
        },
      },
      new Map([
        ['@zeus-js/zeus', '0.1.1-beta.20'],
        ['@zeus-web/button', '0.1.0-beta.35'],
      ]),
    )
    expect(mismatches).toEqual([
      {
        name: '@zeus-web/button',
        actual: '0.1.0-beta.34',
        expected: '0.1.0-beta.35',
      },
    ])
  })

  it('normalizes archive paths and matches wildcard build outputs', () => {
    const root = temporary()
    expect(toFileSpec(path.join(root, 'a.tgz'))).toBe(
      `file:${root.replace(/\\/g, '/')}/a.tgz`,
    )
    fs.mkdirSync(path.join(root, 'dist/assets'), { recursive: true })
    fs.writeFileSync(path.join(root, 'dist/index.html'), 'ok')
    fs.writeFileSync(path.join(root, 'dist/assets/index-abc.js'), 'ok')
    expect(templateOutputExists(root, 'dist/index.html')).toBe(true)
    expect(templateOutputExists(root, 'dist/assets/index-*.js')).toBe(true)
    expect(templateOutputExists(root, 'dist/assets/missing-*.js')).toBe(false)
  })
})
