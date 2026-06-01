import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * Smoke test for zeus-ui CLI.
 *
 * Creates a minimal React project in a temp directory, runs:
 *   pnpm zeus-ui init
 *   pnpm zeus-ui add button
 *   tsc
 *
 * If pnpm zeus-ui is not available, uses node directly.
 */
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-ui-smoke-'))

  console.log(`Creating minimal React project in: ${root}`)

  await fs.mkdir(path.join(root, 'src', 'components', 'ui'), {
    recursive: true,
  })

  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        type: 'module',
        scripts: {
          check: 'tsc --noEmit',
        },
        dependencies: {
          react: '^19.0.0',
          'react-dom': '^19.0.0',
        },
        devDependencies: {
          typescript: '^6.0.3',
          '@types/react': '^19.2.0',
          '@types/react-dom': '^19.2.0',
        },
      },
      null,
      2,
    ),
  )

  await fs.writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          jsx: 'react-jsx',
          strict: true,
          moduleResolution: 'Bundler',
          module: 'ESNext',
          target: 'ES2022',
          paths: {
            '@/*': ['./src/*'],
          },
        },
        include: ['src'],
      },
      null,
      2,
    ),
  )

  console.log('\n> Installing dependencies\n')
  run('pnpm', ['install'], root)

  const zeusUiBin = path.resolve(process.cwd(), 'create/zeus-ui/dist/index.js')

  const hasBin = await fs
    .access(zeusUiBin)
    .then(() => true)
    .catch(() => false)

  const initCmd = hasBin ? 'node' : 'pnpm'
  const initArgs = hasBin
    ? [zeusUiBin, 'init', '--framework', 'react', '--yes']
    : ['zeus-ui', 'init', '--framework', 'react', '--yes']

  console.log('\n> zeus-ui init\n')
  run(initCmd, initArgs, root)

  const addCmd = hasBin ? 'node' : 'pnpm'
  const addArgs = hasBin
    ? [zeusUiBin, 'add', 'button', '--yes']
    : ['zeus-ui', 'add', 'button', '--yes']

  console.log('\n> zeus-ui add button\n')
  run(addCmd, addArgs, root)

  await fs.writeFile(
    path.join(root, 'src', 'App.tsx'),
    `import { Button } from './components/ui/button'

export function App() {
  return <Button variant="outline">Button</Button>
}
`,
  )

  console.log('\n> tsc --noEmit\n')
  run('pnpm', ['check'], root)

  console.log(`\nRegistry CLI smoke test passed: ${root}`)
}

function run(command: string, args: string[], cwd: string) {
  console.log(`$ ${command} ${args.join(' ')}\n`)

  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (exit ${result.status})`,
    )
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
