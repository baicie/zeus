import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  findUnpublishedTemplateDependencies,
  readPackageDependencyRequirements,
} from './check-template-dependencies'
import { scaffold } from '../../packages/create/create-zeus/src/scaffold'

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const require = createRequire(import.meta.url)
export const createZeusTemplates = [
  'basic-ts',
  'application-ts',
  'admin-ts',
  'component-library-ts',
  'web-component-ts',
  'webc-consumer-ts',
] as const

/**
 * The published versions of every package the templates depend on.
 *
 * Read once, before scaffolding, so a template whose pin is not on the
 * registry can be classified instead of attempted. A registry failure throws
 * out of here: "I could not ask" and "it is not there" are different answers
 * and only the second one may defer a template.
 */
async function readPublishedTemplateVersions(
  templates: readonly string[],
  registry: string,
): Promise<ReadonlyMap<string, readonly string[]>> {
  const requirements = templates.flatMap(template =>
    readPackageDependencyRequirements(
      template,
      path.join(
        rootDir,
        'packages/create/create-zeus/templates',
        template,
        'package.json',
      ),
    ),
  )
  const names = [...new Set(requirements.map(item => item.packageName))]
  const { readPublishedVersions } =
    await import('./check-template-dependencies')
  const entries = await Promise.all(
    names.map(
      async name =>
        [name, await readPublishedVersions(name, registry)] as const,
    ),
  )
  return new Map(entries)
}

/** One template's outcome, and why when it is not a pass. */
export interface CreateZeusTemplateResult {
  readonly template: string
  readonly status: string
  readonly detail?: string
}

export async function checkCreateZeus(): Promise<{
  templates: readonly CreateZeusTemplateResult[]
  deferred: readonly string[]
  passed: boolean
}> {
  const smokeRoot = mkdtempSync(path.join(os.tmpdir(), 'zeus-create-smoke-'))
  const report: Array<{ template: string; status: string; detail?: string }> =
    []
  const registry =
    process.env.ZEUS_CREATE_REGISTRY ??
    process.env.npm_config_registry ??
    process.env.NPM_CONFIG_REGISTRY ??
    'https://registry.npmjs.org'
  const published = await readPublishedTemplateVersions(
    createZeusTemplates,
    registry,
  )

  try {
    for (const template of createZeusTemplates) {
      const projectRoot = path.join(smokeRoot, template)

      await scaffold({
        root: projectRoot,
        projectName: `smoke-${template}`,
        template,
      })

      if (template === 'webc-consumer-ts') {
        /*
         * This is the one template installed from the registry. When its pin
         * names a version that has not been published yet — a Core RC paired
         * with a UI RC still on the release train — there is nothing to
         * install, and attempting it produces `ETARGET` with no statement of
         * what it means.
         *
         * Deferring is not passing. The template is recorded as
         * `deferred-to-candidate-gate`, the release precheck fails on that
         * status unless the Release Candidate gate covers the template with
         * real candidate tarballs, and the post-publish registry gate is what
         * finally accepts it.
         */
        const unpublished = findUnpublishedTemplateDependencies(
          readPackageDependencyRequirements(
            template,
            path.join(projectRoot, 'package.json'),
          ),
          published,
        )
        if (unpublished.length > 0) {
          const detail = unpublished
            .map(item => `${item.packageName}@${item.range}`)
            .join(', ')
          /*
           * Deferring has to be claimed, not assumed.
           *
           * Only a caller that will actually run the Release Candidate gate
           * may defer: that gate packs real candidate tarballs from the pinned
           * UI commit and runs `--require-pin-match` against them. Setting the
           * variable is that caller saying so. Without it, an unpublished pin
           * is a failure — the ordinary path has nothing that would cover the
           * template later, and silently deferring would report a run as
           * acceptable because a gate somewhere else might exist.
           */
          if (process.env.ZEUS_CREATE_DEFER_TO_CANDIDATE !== '1') {
            throw new Error(
              `${template} depends on ${detail}, which is not published on ${registry}. ` +
                'Run the Release Candidate gate with ZEUS_CREATE_DEFER_TO_CANDIDATE=1 to cover this template with candidate tarballs, ' +
                'or publish the missing version first.',
            )
          }
          console.log(
            `[create-zeus] ${template} deferred to the candidate gate: ${detail} is not on ${registry}`,
          )
          report.push({
            template,
            status: 'deferred-to-candidate-gate',
            detail,
          })
          continue
        }
        /*
         * `--registry`, explicitly.
         *
         * The deferral decision above asked `registry` whether the pin is
         * published. Without this flag npm reads its own configuration chain
         * instead — a user `.npmrc`, a mirror, an env var — so the check can
         * decide "published" from one registry and then install from another.
         * A workstation with a lagging mirror measured exactly that: the pin
         * was absent from the mirror, present on npmjs, and the failure read as
         * a template defect.
         */
        run(projectRoot, 'npm', [
          'install',
          '--registry',
          registry,
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
        ])
      } else {
        linkWorkspacePackages(projectRoot)
      }
      run(projectRoot, 'tsc', ['--noEmit', '--project', 'tsconfig.json'])
      run(projectRoot, 'vite', ['build'])
      if (
        template === 'application-ts' ||
        template === 'admin-ts' ||
        template === 'component-library-ts'
      ) {
        run(projectRoot, 'vitest', ['run'])
      }
      if (template === 'component-library-ts') {
        assertComponentLibraryOutputs(projectRoot)
      }

      console.log(`[create-zeus] ${template} template passed typecheck + build`)
      report.push({ template, status: 'passed' })
    }
    const output = path.join(rootDir, 'temp/create-zeus')
    mkdirSync(output, { recursive: true })
    writeFileSync(
      path.join(output, 'report.json'),
      `${JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: rootDir,
            encoding: 'utf8',
          }).trim(),
          registry,
          templates: report,
          /*
           * A deferred template is not a pass. `passed` stays false so a
           * caller reading only this field cannot mistake an incomplete run
           * for a complete one; `deferred` names what still needs the
           * candidate or registry gate.
           */
          deferred: report
            .filter(item => item.status === 'deferred-to-candidate-gate')
            .map(item => item.template),
          passed:
            report.every(item => item.status === 'passed') &&
            report.length === createZeusTemplates.length,
        },
        null,
        2,
      )}\n`,
    )
  } finally {
    rmSync(smokeRoot, { recursive: true, force: true })
  }

  return {
    templates: report,
    deferred: report
      .filter(item => item.status === 'deferred-to-candidate-gate')
      .map(item => item.template),
    passed:
      report.every(item => item.status === 'passed') &&
      report.length === createZeusTemplates.length,
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
    compiler: 'packages/compiler/compiler',
    'compiler-shared': 'packages/compiler/compiler-shared',
    'vite-plugin': 'packages/tooling/vite-plugin',
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
  if (command === 'npm') return 'npm'
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
