import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const packageRoot = path.join(root, 'packages/devtools/eslint-plugin')
const output = path.join(root, 'temp/eslint-consumer')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-eslint-consumer-'))
const archives = path.join(work, 'archives')
const project = path.join(work, 'app')
const requireFromRoot = createRequire(import.meta.url)
const versions = {
  eslint: packageVersion('eslint'),
  typescript: packageVersion('typescript'),
  typescriptEslint: packageVersion('typescript-eslint'),
}

fs.mkdirSync(archives)
fs.mkdirSync(project)
fs.mkdirSync(output, { recursive: true })

const env: NodeJS.ProcessEnv = {
  ...process.env,
  CI: 'true',
  npm_config_cache:
    process.env.npm_config_cache ?? path.join(output, 'npm-cache'),
}
delete env.NODE_OPTIONS
delete env.NODE_PATH
delete env.TSX_TSCONFIG_PATH

let passed = false
let failure: string | undefined

try {
  run('pnpm', ['pack', '--pack-destination', archives], packageRoot)
  const archive = fs.readdirSync(archives).find(name => name.endsWith('.tgz'))
  assert(archive, 'Candidate eslint plugin tarball was not created')
  const archivePath = path.join(archives, archive)
  const sha256 = createHash('sha256')
    .update(fs.readFileSync(archivePath))
    .digest('hex')

  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify(
      {
        name: 'zeus-eslint-consumer',
        private: true,
        type: 'module',
        devDependencies: {
          '@zeus-js/eslint-plugin': `file:${archivePath}`,
          eslint: versions.eslint,
          typescript: versions.typescript,
          'typescript-eslint': versions.typescriptEslint,
        },
      },
      null,
      2,
    ),
  )
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--registry',
      'https://registry.npmjs.org',
    ],
    project,
  )

  const loaded = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        "const plugin = require('@zeus-js/eslint-plugin'); process.stdout.write(JSON.stringify({ entry: require.resolve('@zeus-js/eslint-plugin'), rules: Object.keys(plugin.rules) }))",
      ],
      { cwd: project, env, encoding: 'utf8' },
    ),
  ) as { entry: string; rules: string[] }
  const entry = loaded.entry
  assert(
    entry.startsWith(fs.realpathSync(project) + path.sep),
    `Plugin resolved outside the external installation: ${entry}`,
  )
  assert.deepEqual(loaded.rules.sort(), [
    'no-internal-imports',
    'valid-builtin-usage',
  ])

  fs.mkdirSync(path.join(project, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(project, 'eslint.config.mjs'),
    `import zeus from '@zeus-js/eslint-plugin'
import tseslint from 'typescript-eslint'

export default [
  tseslint.configs.base,
  {
    files: ['src/**/*.tsx'],
    plugins: { zeus },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    rules: zeus.configs.recommended.rules,
  },
]
`,
  )
  fs.writeFileSync(
    path.join(project, 'src/valid.tsx'),
    `import { For, Show } from '@zeus-js/zeus'
export const App = () => (
  <>
    <Show when={true}><p>Visible</p></Show>
    <For each={[1]}>{item => <p>{item}</p>}</For>
  </>
)
`,
  )
  fs.writeFileSync(
    path.join(project, 'src/types-consumer.ts'),
    `import plugin, { rules } from '@zeus-js/eslint-plugin'
const recommended = plugin.configs.recommended
const enabled: readonly string[] = Object.keys(recommended?.rules ?? {})
const available: readonly string[] = Object.keys(rules)
void [enabled, available]
`,
  )
  fs.writeFileSync(
    path.join(project, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          noEmit: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['src/types-consumer.ts'],
      },
      null,
      2,
    ),
  )
  run(
    process.execPath,
    [
      path.join(project, 'node_modules/typescript/bin/tsc'),
      '-p',
      'tsconfig.json',
    ],
    project,
  )
  const invalidPath = path.join(project, 'src/invalid.tsx')
  const invalidSource = `import { effect } from '@zeus-js/signal/internal'
import { For, Show } from '@zeus-js/zeus'
export const App = () => <Show><p>{String(effect)}</p></Show>
export const List = () => <For each={[1]}><p>Missing callback</p></For>
`
  fs.writeFileSync(invalidPath, invalidSource)

  run(
    process.execPath,
    [path.join(project, 'node_modules/eslint/bin/eslint.js'), 'src/valid.tsx'],
    project,
  )
  const invalid = spawnSync(
    process.execPath,
    [
      path.join(project, 'node_modules/eslint/bin/eslint.js'),
      'src/invalid.tsx',
      '--format',
      'json',
    ],
    { cwd: project, env, encoding: 'utf8' },
  )
  assert.equal(invalid.status, 1, invalid.stderr)
  const reports = JSON.parse(invalid.stdout) as Array<{
    messages: Array<{ ruleId?: string }>
  }>
  const ruleIds =
    reports[0]?.messages.flatMap(message =>
      message.ruleId ? [message.ruleId] : [],
    ) ?? []
  assert.equal(ruleIds.length, 3)
  assert(ruleIds.includes('zeus/no-internal-imports'))
  assert(ruleIds.includes('zeus/valid-builtin-usage'))

  const fixed = spawnSync(
    process.execPath,
    [
      path.join(project, 'node_modules/eslint/bin/eslint.js'),
      'src/invalid.tsx',
      '--fix',
    ],
    { cwd: project, env, encoding: 'utf8' },
  )
  assert.equal(fixed.status, 1, fixed.stderr)
  assert.equal(fs.readFileSync(invalidPath, 'utf8'), invalidSource)

  passed = true
  console.log(
    `Packed ESLint consumer passed (${versions.eslint}, external rule ids, no unsafe autofix).`,
  )
  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        node: process.version,
        versions,
        sha256,
        entry,
        cjsRules: loaded.rules,
        ruleIds,
        types: 'passed',
        fixableRules: [],
        passed,
      },
      null,
      2,
    )}\n`,
  )
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        node: process.version,
        versions,
        passed,
        failure,
      },
      null,
      2,
    )}\n`,
  )
  throw error
} finally {
  if (passed) fs.rmSync(work, { recursive: true, force: true })
  else console.error(`Failed ESLint consumer retained at ${work}`)
}

function packageVersion(name: string): string {
  return (
    JSON.parse(
      fs.readFileSync(requireFromRoot.resolve(`${name}/package.json`), 'utf8'),
    ) as { version: string }
  ).version
}

function run(
  command: string,
  args: string[],
  cwd: string,
  environment = env,
): void {
  execFileSync(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command !== process.execPath,
  })
}
