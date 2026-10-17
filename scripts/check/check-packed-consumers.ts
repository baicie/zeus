import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const root = path.resolve(import.meta.dirname, '../..')
const destination = path.resolve(
  readOption('--output') ?? 'temp/packed-consumers',
)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-packed-consumers-'))
const archives = path.join(work, 'tarballs')
fs.mkdirSync(archives)
fs.mkdirSync(destination, { recursive: true })
const results: Array<{
  name: string
  status: string
  ms: number
  error?: string
}> = []

const selected = [
  'core/shared',
  'core/signal',
  'core/runtime-dom',
  'core/runtime-ssr',
  'core/zeus',
  'core/compiler',
  'core/compiler-native',
  `core/compiler-native-${platformPackage()}`,
  'devtools/vite-plugin',
  'web-c/bundler-plugin',
  'web-c/component-analyzer',
  'web-c/component-dts',
  'web-c/output-css',
  'web-c/output-icons',
  'web-c/output-wc',
  'web-c/output-react-wrapper',
  'web-c/output-vue-wrapper',
  'web-c/web-c',
  'web-c/web-c-runtime',
]
const packages: Record<string, string> = {}
const browsers = (readOption('--browsers') ?? 'chromium,firefox,webkit').split(
  ',',
)
if (
  browsers.some(browser => !['chromium', 'firefox', 'webkit'].includes(browser))
) {
  throw new Error(
    'Pass --browsers chromium,firefox,webkit or a subset of these engines.',
  )
}

try {
  for (const relative of selected) {
    const directory = path.join(root, 'packages', relative)
    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
    )
    run('pnpm', ['pack', '--pack-destination', archives], directory)
    packages[manifest.name] =
      'file:' +
      path.join(
        archives,
        `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`,
      )
  }
  const producer = prepareProject('producer', '19')
  fs.mkdirSync(path.join(producer, 'src'))
  fs.copyFileSync(
    path.join(root, 'scripts/testing/packed-consumers/component.tsx.fixture'),
    path.join(producer, 'src/component.tsx'),
  )
  fs.writeFileSync(path.join(producer, 'src/index.ts'), 'export {}\n')
  fs.copyFileSync(
    path.join(root, 'scripts/testing/packed-consumers/build-library.mjs'),
    path.join(producer, 'build.mjs'),
  )
  step('library:build', () => run(process.execPath, ['build.mjs'], producer))
  const libraryManifest = {
    name: '@zeus-test/components',
    version: '0.0.0',
    type: 'module',
    files: ['dist'],
    sideEffects: ['./dist/wc/auto.js'],
    exports: {
      './wc': { types: './dist/wc/index.d.ts', import: './dist/wc/index.js' },
      './react': {
        types: './dist/react/index.d.ts',
        import: './dist/react/index.js',
      },
      './vue': {
        types: './dist/vue/index.d.ts',
        import: './dist/vue/index.js',
      },
      './button': {
        types: './dist/wc/z-packed-button.d.ts',
        import: './dist/wc/z-packed-button.js',
      },
      './light-panel': {
        types: './dist/wc/z-packed-light-panel.d.ts',
        import: './dist/wc/z-packed-light-panel.js',
      },
    },
    dependencies: Object.fromEntries(
      [
        '@zeus-js/zeus',
        '@zeus-js/runtime-dom',
        '@zeus-js/web-c-runtime',
        '@zeus-js/output-react-wrapper',
        '@zeus-js/output-vue-wrapper',
      ].map(name => [
        name,
        JSON.parse(
          fs.readFileSync(
            path.join(producer, 'node_modules', name, 'package.json'),
            'utf8',
          ),
        ).version,
      ]),
    ),
    peerDependencies: { react: '>=18', vue: '>=3' },
    peerDependenciesMeta: {
      react: { optional: true },
      vue: { optional: true },
    },
  }
  fs.writeFileSync(
    path.join(producer, 'package.json'),
    JSON.stringify(libraryManifest, null, 2),
  )
  run(
    'npm',
    ['pack', '--pack-destination', archives, '--ignore-scripts'],
    producer,
  )
  packages['@zeus-test/components'] =
    'file:' + path.join(archives, 'zeus-test-components-0.0.0.tgz')

  for (const mode of ['native', 'react18', 'react19', 'vue3']) {
    const project = prepareProject(mode, mode === 'react18' ? '18' : '19')
    for (const file of [
      'browser.mjs',
      'ssr.mjs',
      'types.ts',
      'vite.config.mjs',
      'native.tsx',
    ]) {
      fs.copyFileSync(
        path.join(
          root,
          'scripts/testing/packed-consumers',
          /\.tsx?$/.test(file) ? file + '.fixture' : file,
        ),
        path.join(project, file),
      )
    }
    if (mode === 'native') {
      fs.copyFileSync(
        path.join(root, 'scripts/testing/packed-consumers/native-checks.mjs'),
        path.join(project, 'native-checks.mjs'),
      )
    }
    fs.writeFileSync(
      path.join(project, 'entry.mjs'),
      `
import { runConsumer } from './browser.mjs';
${mode === 'native' ? "import { runNativeChecks } from './native-checks.mjs';" : ''}
window.packedResult = (async () => {
  const result = await runConsumer();
  ${mode === 'native' ? 'runNativeChecks();' : ''}
  return result;
})().catch(error => ({ mode: ${JSON.stringify(mode)}, passed: false, error: String(error.stack || error) }));
`,
    )
    fs.writeFileSync(
      path.join(project, 'index.html'),
      '<div id="app"></div><script type="module" src="/entry.mjs"></script>',
    )
    const environment = { ...process.env, ZEUS_CONSUMER_MODE: mode }
    step(`${mode}:ssr`, () =>
      run(process.execPath, ['ssr.mjs'], project, environment),
    )
    step(`${mode}:types`, () =>
      run(
        path.join(project, 'node_modules/.bin/tsc'),
        [
          '--noEmit',
          '--strict',
          '--skipLibCheck',
          '--module',
          'esnext',
          '--moduleResolution',
          'bundler',
          '--target',
          'es2022',
          '--lib',
          'es2022,dom',
          '--jsx',
          'preserve',
          '--jsxImportSource',
          '@zeus-js/zeus',
          'types.ts',
          ...(mode === 'native' ? ['native.tsx'] : []),
        ],
        project,
      ),
    )
    step(`${mode}:build`, () =>
      run(
        path.join(project, 'node_modules/.bin/vite'),
        ['build'],
        project,
        environment,
      ),
    )
    for (const browser of browsers)
      step(`${mode}:browser:${browser}`, () =>
        run(
          process.execPath,
          [
            path.join(
              root,
              'scripts/testing/packed-consumers/browser-runner.mjs',
            ),
            project,
            mode,
            browser,
          ],
          root,
        ),
      )
  }
} catch (error) {
  results.push({
    name: 'pipeline',
    status: 'failed',
    ms: 0,
    error: String(error),
  })
  process.exitCode = 1
} finally {
  const report = {
    createdAt: new Date().toISOString(),
    work,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    results,
  }
  fs.writeFileSync(
    path.join(destination, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  )
  console.log(
    `Packed consumer report: ${path.join(destination, 'report.json')}`,
  )
  // Keep the independent projects and logs for exact reproduction after failures.
  console.log(`Independent consumer projects: ${work}`)
}

function prepareProject(name: string, reactVersion: string): string {
  const directory = path.join(work, name)
  const entries =
    name === 'producer'
      ? [
          '@zeus-js/web-c',
          '@zeus-js/bundler-plugin',
          '@zeus-js/zeus',
          `@zeus-js/compiler-native-${platformPackage()}`,
        ]
      : name === 'native'
        ? [
            '@zeus-test/components',
            '@zeus-js/zeus',
            '@zeus-js/vite-plugin',
            `@zeus-js/compiler-native-${platformPackage()}`,
          ]
        : ['@zeus-test/components']
  fs.mkdirSync(directory)
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          ...Object.fromEntries(entries.map(entry => [entry, packages[entry]])),
          react: reactVersion,
          'react-dom': reactVersion,
          vue: '^3.5.0',
          vite: '^8.0.0',
          rollup: '^4.0.0',
          typescript: '^6.0.0',
          '@types/react': reactVersion,
          '@types/react-dom': reactVersion,
        },
        overrides: packages,
      },
      null,
      2,
    ),
  )
  step(`${name}:install`, () =>
    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--registry',
        readOption('--registry') ?? 'https://registry.npmjs.org',
      ],
      directory,
    ),
  )
  for (const name of Object.keys(packages)) {
    if (!fs.existsSync(path.join(directory, 'node_modules', name))) {
      if (entries.includes(name))
        throw new Error(`Missing consumer entry: ${name}`)
      continue
    }
    const installed = fs.realpathSync(
      path.join(directory, 'node_modules', name),
    )
    if (!installed.startsWith(fs.realpathSync(directory) + path.sep))
      throw new Error(`Consumer dependency escaped its installation: ${name}`)
  }
  return directory
}

function step(name: string, execute: () => void): void {
  const start = performance.now()
  try {
    execute()
    results.push({
      name,
      status: 'passed',
      ms: Math.round(performance.now() - start),
    })
    console.log(`[packed-consumer] ${name} passed`)
  } catch (error) {
    results.push({
      name,
      status: 'failed',
      ms: Math.round(performance.now() - start),
      error: String(error),
    })
    throw error
  }
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env = process.env,
): void {
  const log = path.join(destination, 'commands.log')
  fs.appendFileSync(log, `${cwd}\n${command} ${args.join(' ')}\n`)
  try {
    const output = execFileSync(command, args, {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    })
    fs.appendFileSync(log, output + '\n')
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string }
    fs.appendFileSync(log, `${failure.stdout ?? ''}\n${failure.stderr ?? ''}\n`)
    throw error
  }
}

function readOption(option: string): string | undefined {
  const index = process.argv.indexOf(option)
  return index < 0 ? undefined : process.argv[index + 1]
}

function platformPackage(): string {
  if (process.platform === 'darwin') return `darwin-${process.arch}`
  if (process.platform === 'linux')
    return `linux-${process.arch}-${'glibcVersionRuntime' in (process.report.getReport() as { header: object }).header ? 'gnu' : 'musl'}`
  if (process.platform === 'win32') return `win32-${process.arch}-msvc`
  throw new Error(
    `Unsupported compiler smoke platform: ${process.platform}-${process.arch}`,
  )
}
