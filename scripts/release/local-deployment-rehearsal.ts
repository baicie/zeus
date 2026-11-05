/**
 * Local deployment rehearsal for the four 0.2.0 products. It builds the
 * production bundles, serves them from separate origins, runs the same
 * HTTP/browser acceptance used for a real deployment and records the result
 * as LOCAL_VALIDATED. It never deploys, publishes or edits tracked files.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { runDeploymentAcceptance } from './deployment-acceptance'

const root = path.resolve(import.meta.dirname, '../..')

interface Closeable {
  close(): Promise<void> | void
}

const ADMIN_PASSWORD = 'local-admin-password-123'
const VIEWER_PASSWORD = 'local-viewer-password-123'
const PORTS = {
  host: 4173,
  sandbox: 4174,
  admin: 4175,
  workbench: 4176,
  aiHost: 4177,
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'ui-root': { type: 'string' },
      browsers: { type: 'string', default: 'chromium' },
      'skip-build': { type: 'boolean', default: false },
    },
  })
  const uiRoot = values['ui-root']
    ? path.resolve(values['ui-root'])
    : process.env.ZEUS_UI_ROOT
      ? path.resolve(process.env.ZEUS_UI_ROOT)
      : undefined

  void rehearse(uiRoot, (values.browsers ?? 'chromium').split(','), {
    skipBuild: values['skip-build'] === true,
  })
}

async function rehearse(
  uiRoot: string | undefined,
  engines: readonly string[],
  options: { readonly skipBuild: boolean },
): Promise<void> {
  const closeables: Closeable[] = []
  try {
    if (!options.skipBuild) buildCoreArtifacts(uiRoot)
    const playground = await servePlayground()
    closeables.push(playground)
    const admin = await startAdmin()
    closeables.push(admin)
    const ai = uiRoot ? await startAi(uiRoot) : undefined
    if (ai) closeables.push(ai)

    const coreCommit = git(root, ['rev-parse', 'HEAD'])
    const uiCommit = uiRoot ? git(uiRoot, ['rev-parse', 'HEAD']) : coreCommit
    const manifestFile = path.join(root, 'temp/release/deployment.local.json')
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true })

    const products = [
      {
        product: 'webc-studio',
        url: `${playground.hostOrigin}/webc.html`,
        commit: coreCommit,
        repository: 'baicie/zeus',
      },
      {
        product: 'native-lab',
        url: `${playground.hostOrigin}/`,
        commit: coreCommit,
        repository: 'baicie/zeus',
      },
      {
        product: 'admin',
        url: `${admin.origin}/`,
        commit: coreCommit,
        repository: 'baicie/zeus',
      },
      ...(ai
        ? [
            {
              product: 'ai-workbench',
              url: `${ai.workbenchOrigin}/`,
              commit: uiCommit,
              repository: 'baicie/zeus-ui',
            },
          ]
        : []),
    ]
    fs.writeFileSync(
      manifestFile,
      `${JSON.stringify(
        {
          schema: 'zeus.deployment-manifest/v1',
          coreCommit,
          uiCommit,
          products,
        },
        null,
        2,
      )}\n`,
    )

    process.env.ZEUS_ADMIN_PASSWORD = ADMIN_PASSWORD
    const report = await runDeploymentAcceptance({
      manifestFile,
      mode: 'local',
      coreCommit,
      uiCommit,
      engines,
    })
    const output = path.join(
      root,
      'temp/release/deployment-acceptance.local.json',
    )
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`${report.decision}: ${path.relative(root, output)}`)
    for (const result of report.products) {
      console.log(`- ${result.product}: ${result.status} ${result.url}`)
      if (result.error) console.log(`  error: ${result.error}`)
    }
    for (const blocker of report.blockers) console.log(`- ${blocker}`)
    if (report.decision !== 'LOCAL_VALIDATED') process.exitCode = 1
  } finally {
    for (const closeable of closeables.reverse()) {
      await closeable.close()
    }
  }
}

function buildCoreArtifacts(uiRoot: string | undefined): void {
  const wasm = path.join(root, 'packages/core/compiler-wasm/zeus-compiler.wasm')
  if (!fs.existsSync(wasm)) {
    run('pnpm', ['--filter', '@zeus-js/compiler-wasm', 'build:wasm'], root)
  }
  run('pnpm', ['build'], root)
  run('pnpm', ['--filter', '@zeus-js/example-admin', 'build'], root, {
    ...process.env,
  })
  run(
    'pnpm',
    ['--filter', '@zeus-js/example-playground-editor', 'build'],
    root,
    {
      ...process.env,
      VITE_ZEUS_SANDBOX_ORIGIN: `http://localhost:${PORTS.sandbox}`,
    },
  )
  if (uiRoot) {
    run('pnpm', ['build'], uiRoot)
    run(
      'pnpm',
      ['--filter', '@zeus-web/example-ai-workbench', 'build'],
      uiRoot,
      {
        ...process.env,
        ZEUS_AI_HOST_ORIGIN: `http://127.0.0.1:${PORTS.aiHost}`,
      },
    )
  }
}

async function servePlayground(): Promise<{
  close(): Promise<void>
  hostOrigin: string
}> {
  const dist = path.join(root, 'examples/playground-editor/dist')
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error('playground dist is missing; build it first')
  }
  const host = await startStaticServer(dist, PORTS.host)
  const sandbox = await startStaticServer(dist, PORTS.sandbox)
  return {
    hostOrigin: `http://127.0.0.1:${PORTS.host}`,
    async close() {
      await Promise.all([host.close(), sandbox.close()])
    },
  }
}

async function startAdmin(): Promise<Closeable & { origin: string }> {
  const module = (await import(
    pathToFileURL(path.join(root, 'examples/admin/server/index.ts')).href
  )) as {
    startAdminServer(options: {
      port: number
      databaseFile: string
      staticDir: string
      adminPassword: string
      viewerPassword: string
    }): Promise<{ origin: string; close(): Promise<void> }>
  }
  const databaseFile = path.join(root, 'temp/release/local-admin.sqlite')
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${databaseFile}${suffix}`, { force: true })
  }
  return module.startAdminServer({
    port: PORTS.admin,
    databaseFile,
    staticDir: path.join(root, 'examples/admin/dist'),
    adminPassword: ADMIN_PASSWORD,
    viewerPassword: VIEWER_PASSWORD,
  })
}

async function startAi(
  uiRoot: string,
): Promise<Closeable & { workbenchOrigin: string }> {
  const workbenchDist = path.join(uiRoot, 'examples/ai-workbench/dist')
  if (!fs.existsSync(path.join(workbenchDist, 'index.html'))) {
    throw new Error('AI workbench dist is missing; build it first')
  }
  const workbenchOrigin = `http://127.0.0.1:${PORTS.workbench}`
  const server = await startStaticServer(workbenchDist, PORTS.workbench)
  const module = (await import(
    pathToFileURL(path.join(uiRoot, 'examples/ai-host/src/server.ts')).href
  )) as {
    startAiHost(options: {
      databaseFile: string
      workspaceRoot: string
      port: number
      hostname: string
      allowedOrigins: readonly string[]
    }): Promise<{ origin: string; close(): Promise<void> }>
  }
  const databaseFile = path.join(root, 'temp/release/local-ai.sqlite')
  const workspaceRoot = path.join(root, 'temp/release/local-ai-workspace')
  fs.rmSync(databaseFile, { force: true })
  fs.rmSync(workspaceRoot, { recursive: true, force: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })
  const host = await module.startAiHost({
    databaseFile,
    workspaceRoot,
    port: PORTS.aiHost,
    hostname: '127.0.0.1',
    allowedOrigins: [workbenchOrigin, `http://localhost:${PORTS.workbench}`],
  })
  return {
    workbenchOrigin,
    async close() {
      await host.close()
      await server.close()
    },
  }
}

interface StaticServer {
  close(): Promise<void>
}

function startStaticServer(
  rootDir: string,
  port: number,
): Promise<StaticServer> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
    let file = path.join(rootDir, decodeURIComponent(url.pathname))
    if (!file.startsWith(rootDir)) {
      response.writeHead(403).end()
      return
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html')
    }
    if (!fs.existsSync(file)) {
      const fallback = path.join(rootDir, 'index.html')
      if (url.pathname === '/' || url.pathname.endsWith('/')) {
        file = fallback
      } else {
        response.writeHead(404).end()
        return
      }
    }
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    response.setHeader('Content-Type', contentType(file))
    fs.createReadStream(file).pipe(response)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject)
      resolve({
        close: () =>
          new Promise<void>((done, fail) => {
            server.close(error => (error ? fail(error) : done()))
          }),
      })
    })
  })
}

function contentType(file: string): string {
  const extension = path.extname(file)
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8',
  }
  return types[extension] ?? 'application/octet-stream'
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  })
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

if (import.meta.url === `file://${path.resolve(process.argv[1] ?? '')}`) {
  main()
}
