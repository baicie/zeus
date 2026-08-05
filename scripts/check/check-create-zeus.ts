import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { scaffold } from '../../packages/devtools/create-zeus/src/scaffold'

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const require = createRequire(import.meta.url)
const smokeRoot = mkdtempSync(path.join(os.tmpdir(), 'zeus-create-smoke-'))
const templates = ['basic-ts', 'web-component-ts'] as const

try {
  for (const template of templates) {
    const projectRoot = path.join(smokeRoot, template)

    await scaffold({
      root: projectRoot,
      projectName: `smoke-${template}`,
      template,
    })

    linkWorkspacePackages(projectRoot)
    run(projectRoot, 'tsc', ['--noEmit', '--project', 'tsconfig.json'])
    run(projectRoot, 'vite', ['build'])

    console.log(`[create-zeus] ${template} template passed typecheck + build`)
  }
} finally {
  rmSync(smokeRoot, { recursive: true, force: true })
}

function linkWorkspacePackages(projectRoot: string): void {
  const nodeModules = path.join(projectRoot, 'node_modules')
  const scopeRoot = path.join(nodeModules, '@zeus-js')
  mkdirSync(scopeRoot, { recursive: true })

  for (const [name, relativeDir] of Object.entries({
    zeus: 'packages/core/zeus',
    'runtime-dom': 'packages/core/runtime-dom',
    'runtime-ssr': 'packages/core/runtime-ssr',
    signal: 'packages/core/signal',
    shared: 'packages/core/shared',
    compiler: 'packages/core/compiler',
    'compiler-shared': 'packages/core/compiler-shared',
    'vite-plugin': 'packages/devtools/vite-plugin',
  })) {
    symlinkSync(
      path.join(rootDir, relativeDir),
      path.join(scopeRoot, name),
      'dir',
    )
  }

  symlinkSync(
    path.dirname(
      require.resolve('typescript/package.json', { paths: [rootDir] }),
    ),
    path.join(nodeModules, 'typescript'),
    'dir',
  )
  symlinkSync(
    path.dirname(
      require.resolve('vite/package.json', {
        paths: [path.join(rootDir, 'examples/counter')],
      }),
    ),
    path.join(nodeModules, 'vite'),
    'dir',
  )
}

function run(cwd: string, command: string, args: string[]): void {
  const executable = resolveExecutable(command)

  execFileSync(executable, args, {
    cwd,
    env: { ...process.env, CI: 'true' },
    stdio: 'inherit',
  })
}

function resolveExecutable(command: string): string {
  if (command === 'tsc') {
    return require.resolve('typescript/bin/tsc', { paths: [rootDir] })
  }

  const vitePackage = path.dirname(
    require.resolve('vite/package.json', {
      paths: [path.join(rootDir, 'examples/counter')],
    }),
  )

  return path.join(vitePackage, 'bin/vite.js')
}
