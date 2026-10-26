import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { scaffold } from '../../packages/devtools/create-zeus/src/scaffold'

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const require = createRequire(import.meta.url)
export const createZeusTemplates = [
  'basic-ts',
  'application-ts',
  'component-library-ts',
  'web-component-ts',
] as const

export async function checkCreateZeus(): Promise<void> {
  const smokeRoot = mkdtempSync(path.join(os.tmpdir(), 'zeus-create-smoke-'))

  try {
    for (const template of createZeusTemplates) {
      const projectRoot = path.join(smokeRoot, template)

      await scaffold({
        root: projectRoot,
        projectName: `smoke-${template}`,
        template,
      })

      linkWorkspacePackages(projectRoot)
      run(projectRoot, 'tsc', ['--noEmit', '--project', 'tsconfig.json'])
      run(projectRoot, 'vite', ['build'])
      if (
        template === 'application-ts' ||
        template === 'component-library-ts'
      ) {
        run(projectRoot, 'vitest', ['run'])
      }
      if (template === 'component-library-ts') {
        assertComponentLibraryOutputs(projectRoot)
      }

      console.log(`[create-zeus] ${template} template passed typecheck + build`)
    }
  } finally {
    rmSync(smokeRoot, { recursive: true, force: true })
  }
}

export function assertComponentLibraryOutputs(projectRoot: string): void {
  const expected = [
    'custom-elements.json',
    'zeus.components.json',
    'wc/auto.js',
    'wc/index.js',
    'wc/z-greeting.entry.js',
    'react/index.js',
    'vue/index.js',
  ]
  const missing = expected.filter(
    file => !existsSync(path.join(projectRoot, 'dist', file)),
  )

  if (missing.length) {
    console.error(
      'Component library files:',
      listFiles(path.join(projectRoot, 'dist')).join(', '),
    )
    throw new Error(
      `Component library template is missing build outputs: ${missing.join(', ')}`,
    )
  }
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) return listFiles(fullPath)
    return [path.relative(root, fullPath)]
  })
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
    'web-c': 'packages/web-c/web-c',
    'output-react-wrapper': 'packages/web-c/output-react-wrapper',
    'output-vue-wrapper': 'packages/web-c/output-vue-wrapper',
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
  symlinkSync(
    path.dirname(require.resolve('vitest/package.json', { paths: [rootDir] })),
    path.join(nodeModules, 'vitest'),
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

  const packageName = command === 'vite' ? 'vite' : 'vitest'
  const packageDir = path.dirname(
    require.resolve(`${packageName}/package.json`, {
      paths: [
        command === 'vite' ? path.join(rootDir, 'examples/counter') : rootDir,
      ],
    }),
  )

  return path.join(
    packageDir,
    command === 'vite' ? 'bin/vite.js' : 'vitest.mjs',
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await checkCreateZeus()
}
