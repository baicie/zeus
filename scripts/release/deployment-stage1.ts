/**
 * Host-deployment Stage 1: build immutable images from the checked-out
 * Core/UI commits, validate the Compose template, start the four products
 * locally and run the real local acceptance. It never deploys publicly and
 * never reads production secrets.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { runDeploymentAcceptance } from './deployment-acceptance'
import { createAiDeploymentEnvironment } from './deployment-ai'

const root = path.resolve(import.meta.dirname, '../..')
let repoRoot = root
const TENANT = 'stage1-local-acceptance'
const ADMIN_PASSWORD = 'stage1-admin-password-123'
const VIEWER_PASSWORD = 'stage1-viewer-password-123'
const PROJECT = 'zeus-stage1-local'

function main(): void {
  const { values } = parseArgs({
    options: {
      'core-root': { type: 'string' },
      'ui-root': { type: 'string' },
      compose: { type: 'string' },
      output: { type: 'string', default: 'temp/deploy/stage1' },
      browsers: { type: 'string', default: 'chromium' },
      'skip-build': { type: 'boolean', default: false },
      'reuse-images': { type: 'boolean', default: false },
      'keep-containers': { type: 'boolean', default: false },
      'sandbox-url': { type: 'string' },
      'host-origins': { type: 'string' },
    },
  })
  const coreRoot = values['core-root']
    ? path.resolve(values['core-root'])
    : root
  repoRoot = coreRoot
  const uiRoot = values['ui-root']
    ? path.resolve(values['ui-root'])
    : path.resolve(coreRoot, '../../zeus-ui')
  const output = path.resolve(values.output ?? 'temp/deploy/stage1')
  const composeFile = values.compose
    ? path.resolve(values.compose)
    : path.join(coreRoot, 'deploy/host-validation/compose.yml')
  void runStage1({
    coreRoot,
    uiRoot,
    output,
    composeFile,
    engines: (values.browsers ?? 'chromium').split(','),
    skipBuild: values['skip-build'] === true,
    reuseImages: values['reuse-images'] === true,
    keepContainers: values['keep-containers'] === true,
    sandboxUrl: values['sandbox-url'],
    hostOrigins: values['host-origins'],
  })
}

interface Stage1Options {
  readonly coreRoot: string
  readonly uiRoot: string
  readonly output: string
  readonly composeFile: string
  readonly engines: readonly string[]
  readonly skipBuild: boolean
  readonly reuseImages: boolean
  readonly keepContainers: boolean
  readonly sandboxUrl?: string
  readonly hostOrigins?: string
}

async function runStage1(options: Stage1Options): Promise<void> {
  fs.mkdirSync(options.output, { recursive: true })
  assertClean(options.coreRoot, 'Core', options.uiRoot)
  assertClean(options.uiRoot, 'Zeus UI')
  const coreCommit = git(options.coreRoot, ['rev-parse', 'HEAD'])
  const coreTree = git(options.coreRoot, ['rev-parse', 'HEAD^{tree}'])
  const uiCommit = git(options.uiRoot, ['rev-parse', 'HEAD'])
  const version = String(
    (
      JSON.parse(
        fs.readFileSync(path.join(options.coreRoot, 'package.json'), 'utf8'),
      ) as {
        version: string
      }
    ).version,
  )
  const builtAt = new Date().toISOString()
  const images = options.skipBuild
    ? readExistingImages(options.output)
    : buildImages({
        coreRoot: options.coreRoot,
        coreCommit,
        coreTree,
        uiCommit,
        version,
        builtAt,
        uiRoot: options.uiRoot,
        reuseImages: options.reuseImages,
        sandboxUrl:
          options.sandboxUrl ??
          process.env.ZEUS_PLAYGROUND_SANDBOX_URL ??
          'http://localhost:8081',
        hostOrigins:
          options.hostOrigins ??
          process.env.ZEUS_PLAYGROUND_HOST_ORIGINS ??
          'http://127.0.0.1:8080',
      })
  const oci = exportImages(options.output, images)
  const envFile = path.join(options.output, 'stage1.env')
  writeEnvFile(envFile, images, uiCommit, options.output)
  fs.chmodSync(envFile, 0o600)
  const composeFile = options.composeFile
  dockerCompose(['config', '--quiet'], composeFile, envFile)
  let report
  try {
    dockerCompose(
      ['up', '-d', '--wait', '--wait-timeout', '120'],
      composeFile,
      envFile,
    )
    await waitForHealth(composeFile, envFile)
    const manifestFile = path.join(options.output, 'deployment.local.json')
    const manifest = {
      schema: 'zeus.deployment-manifest/v2',
      coreCommit,
      uiCommit,
      allowedHosts: ['127.0.0.1', 'localhost'],
      products: [
        product(
          'webc-studio',
          'http://127.0.0.1:8080/webc.html',
          coreCommit,
          images.playground,
        ),
        product(
          'native-lab',
          'http://127.0.0.1:8080/',
          coreCommit,
          images.playground,
        ),
        product('admin', 'http://127.0.0.1:8082/', coreCommit, images.admin),
        {
          ...product(
            'ai-workbench',
            'http://127.0.0.1:8083/',
            uiCommit,
            images.workbench,
          ),
          healthUrl: 'http://127.0.0.1:8083/ai-host/health',
        },
      ],
    }
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
    process.env.ZEUS_ACCEPTANCE_ADMIN_EMAIL = 'acceptance@example.test'
    process.env.ZEUS_ACCEPTANCE_ADMIN_PASSWORD = ADMIN_PASSWORD
    process.env.ZEUS_ACCEPTANCE_AI_REPLAY = 'true'
    process.env.ZEUS_ACCEPTANCE_TENANT = TENANT
    report = await runDeploymentAcceptance({
      manifestFile,
      mode: 'local',
      coreCommit,
      uiCommit,
      engines: options.engines,
      writeMode: 'isolated',
      tenant: TENANT,
    })
  } finally {
    if (!options.keepContainers) {
      dockerCompose(
        ['down', '-v', '--remove-orphans'],
        composeFile,
        envFile,
        false,
      )
    }
    fs.rmSync(envFile, { force: true })
  }
  const candidate = {
    schema: 'zeus.deployment-candidate/v1',
    coreCommit,
    uiCommit,
    version,
    builtAt,
    images: Object.fromEntries(
      Object.entries(images).map(([key, image]) => [
        key,
        { ...image, ...oci[key as keyof typeof oci] },
      ]),
    ),
    compose: 'deploy/host-validation/compose.yml',
    report: report.decision,
  }
  const provenance = {
    schema: 'zeus.provenance/v1',
    coreCommit,
    uiCommit,
    runId: process.env.GITHUB_RUN_ID ?? 'stage1-local',
    runUrl:
      process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
        ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : 'local://stage1',
    createdAt: builtAt,
    products: [
      provenanceProduct('webc-studio', images.playground),
      provenanceProduct('native-lab', images.playground),
      provenanceProduct('admin', images.admin),
      provenanceProduct('ai-workbench', images.workbench),
    ],
  }
  fs.writeFileSync(
    path.join(options.output, 'provenance.json'),
    `${JSON.stringify(provenance, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(options.output, 'pair.json'),
    `${JSON.stringify(
      {
        schema: 'zeus.release-pair/v1',
        coreCommit,
        uiCommit,
        runId: process.env.GITHUB_RUN_ID ?? 'stage1-local',
        createdAt: builtAt,
      },
      null,
      2,
    )}\n`,
  )
  fs.writeFileSync(
    path.join(options.output, 'deployment-candidate.json'),
    `${JSON.stringify(candidate, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(options.output, 'deployment-acceptance.local.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(`${report.decision}: ${path.relative(root, options.output)}`)
  for (const result of report.products) {
    console.log(`- ${result.product}: ${result.status}`)
    if (result.error) console.error(`  ${result.error}`)
  }
  if (report.decision !== 'LOCAL_VALIDATED') process.exitCode = 1
}

interface ImageRecord {
  readonly image: string
  readonly imageDigest: string
  readonly artifactDigest: string
  readonly buildInfo: unknown
  readonly ociArchive: string
  readonly ociSha256: string
}

function buildImages(input: {
  readonly coreRoot: string
  readonly coreCommit: string
  readonly coreTree: string
  readonly uiCommit: string
  readonly version: string
  readonly builtAt: string
  readonly uiRoot: string
  readonly reuseImages: boolean
  readonly sandboxUrl: string
  readonly hostOrigins: string
}): Record<'playground' | 'admin' | 'aiHost' | 'workbench', ImageRecord> {
  const common = [
    '--build-arg',
    `ZEUS_CORE_COMMIT=${input.coreCommit}`,
    '--build-arg',
    `ZEUS_SOURCE_TREE=${input.coreTree}`,
    '--build-arg',
    `ZEUS_UI_COMMIT=${input.uiCommit}`,
    '--build-arg',
    `ZEUS_VERSION=${input.version}`,
    '--build-arg',
    `ZEUS_BUILD_TIME=${input.builtAt}`,
  ]
  const specs = {
    playground: {
      image: 'zeus-playground:stage1',
      context: input.coreRoot,
      dockerfile: 'examples/playground-editor/Dockerfile',
      extra: [
        '--build-arg',
        `VITE_ZEUS_SANDBOX_URL=${input.sandboxUrl}`,
        '--build-arg',
        `VITE_ZEUS_PLAYGROUND_HOST_ORIGINS=${input.hostOrigins}`,
      ],
      buildInfoPath: '/usr/share/nginx/html/build-info.json',
    },
    admin: {
      image: 'zeus-admin:stage1',
      context: input.coreRoot,
      dockerfile: 'examples/admin/Dockerfile',
      extra: [],
      buildInfoPath: '/app/dist/build-info.json',
    },
    aiHost: {
      image: 'zeus-ai-host:stage1',
      context: input.uiRoot,
      dockerfile: 'examples/ai-host/Dockerfile',
      extra: [],
      buildInfoPath: undefined,
    },
    workbench: {
      image: 'zeus-ai-workbench:stage1',
      context: input.uiRoot,
      dockerfile: 'examples/ai-workbench/Dockerfile',
      extra: [],
      buildInfoPath: '/usr/share/nginx/html/build-info.json',
    },
  } as const
  const result = {} as Record<keyof typeof specs, ImageRecord>
  for (const [key, spec] of Object.entries(specs)) {
    if (input.reuseImages && imageExists(spec.image)) {
      console.log(`[stage1] reusing ${spec.image}`)
      result[key as keyof typeof specs] = inspectImage(
        spec.image,
        spec.buildInfoPath,
      )
      continue
    }
    const dockerfile = path.join(spec.context, spec.dockerfile)
    const args = [
      'build',
      ...common,
      ...spec.extra,
      '-f',
      dockerfile,
      '-t',
      spec.image,
      spec.context,
    ]
    console.log(`[stage1] docker ${args.join(' ')}`)
    const built = spawnSync('docker', args, { stdio: 'inherit' })
    if (built.status !== 0) throw new Error(`docker build failed for ${key}`)
    result[key as keyof typeof specs] = inspectImage(
      spec.image,
      spec.buildInfoPath,
    )
  }
  return result
}

function provenanceProduct(product: string, image: ImageRecord) {
  return {
    product,
    artifactDigest: image.artifactDigest,
    imageDigest: image.imageDigest,
    buildInfo: image.buildInfo,
  }
}

function exportImages(
  output: string,
  images: Record<string, ImageRecord>,
): Record<string, { ociArchive: string; ociSha256: string }> {
  const directory = path.join(output, 'oci')
  fs.mkdirSync(directory, { recursive: true })
  const result: Record<string, { ociArchive: string; ociSha256: string }> = {}
  for (const [key, record] of Object.entries(images)) {
    const archive = path.join(directory, `${key}.tar`)
    run('docker', ['save', '--output', archive, record.image])
    result[key] = {
      ociArchive: path.relative(output, archive),
      ociSha256: sha256File(archive),
    }
  }
  return result
}

function sha256File(file: string): string {
  return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`
}

function imageExists(image: string): boolean {
  return (
    spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' })
      .status === 0
  )
}

function inspectImage(
  image: string,
  buildInfoPath: string | undefined,
): ImageRecord {
  const imageDigest = run('docker', [
    'image',
    'inspect',
    '--format',
    '{{.Id}}',
    image,
  ]).trim()
  if (!buildInfoPath) {
    // The AI Host image ships OCI labels instead of a build-info file. Bind
    // its Core/UI provenance through those labels and a canonical digest.
    let labels: Record<string, string> = {}
    try {
      labels = JSON.parse(
        run('docker', [
          'image',
          'inspect',
          '--format',
          '{{json .Config.Labels}}',
          image,
        ]).trim() || '{}',
      ) as Record<string, string>
    } catch {
      labels = {}
    }
    const buildInfo = {
      schema: 'zeus.build-info/v1',
      product: 'ai-host',
      coreCommit: labels['top.moonbyte.zeus.core-commit'] ?? '',
      uiCommit: labels['top.moonbyte.zeus.ui-commit'] ?? '',
      version: labels['org.opencontainers.image.version'] ?? '',
      builtAt: labels['top.moonbyte.zeus.build-time'] ?? '',
    }
    const artifactDigest = `sha256:${createHash('sha256')
      .update(JSON.stringify(buildInfo))
      .digest('hex')}`
    return {
      image,
      imageDigest,
      artifactDigest,
      buildInfo: { ...buildInfo, artifactDigest },
      ociArchive: '',
      ociSha256: '',
    }
  }
  const container = `stage1-inspect-${image.replace(/[^a-z0-9]/gi, '-')}`
  const tmp = path.join(repoRoot, 'temp/deploy/stage1', `${container}.json`)
  fs.mkdirSync(path.dirname(tmp), { recursive: true })
  run('docker', ['rm', '-f', container], true)
  run('docker', ['create', '--name', container, image])
  try {
    run('docker', ['cp', `${container}:${buildInfoPath}`, tmp])
  } finally {
    run('docker', ['rm', '-f', container], true)
  }
  const buildInfo = JSON.parse(fs.readFileSync(tmp, 'utf8')) as {
    artifactDigest: string
  }
  return {
    image,
    imageDigest,
    artifactDigest: buildInfo.artifactDigest,
    buildInfo,
    ociArchive: '',
    ociSha256: '',
  }
}

function product(
  name: string,
  url: string,
  commit: string,
  image: ImageRecord,
): Record<string, unknown> {
  return {
    product: name,
    url,
    commit,
    repository: name === 'ai-workbench' ? 'baicie/zeus-ui' : 'baicie/zeus',
    artifactDigest: image.artifactDigest,
    imageDigest: image.imageDigest,
  }
}

function writeEnvFile(
  file: string,
  images: Record<string, ImageRecord>,
  uiCommit: string,
  output: string,
): void {
  const ai = createAiDeploymentEnvironment(TENANT, { publicReplay: true })
  const dataRoot = path.join(output, 'data')
  for (const directory of [
    path.join(dataRoot, 'admin'),
    path.join(dataRoot, 'ai'),
  ]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o777 })
    fs.chmodSync(directory, 0o777)
  }
  const lines = [
    `ZEUS_PLAYGROUND_IMAGE=${images.playground.image}`,
    `ZEUS_ADMIN_IMAGE=${images.admin.image}`,
    `ZEUS_AI_HOST_IMAGE=${images.aiHost.image}`,
    `ZEUS_AI_WORKBENCH_IMAGE=${images.workbench.image}`,
    `ZEUS_PLAYGROUND_CONTAINER=zeus-stage1-playground`,
    `ZEUS_ADMIN_CONTAINER=zeus-stage1-admin`,
    `ZEUS_AI_HOST_CONTAINER=zeus-stage1-ai-host`,
    `ZEUS_AI_WORKBENCH_CONTAINER=zeus-stage1-ai-workbench`,
    'ZEUS_PLAYGROUND_BIND=127.0.0.1',
    'ZEUS_PLAYGROUND_HOST_PORT=8080',
    'ZEUS_PLAYGROUND_SANDBOX_PORT=8081',
    'ZEUS_ADMIN_BIND=127.0.0.1',
    'ZEUS_ADMIN_PORT=8082',
    'ZEUS_AI_WORKBENCH_BIND=127.0.0.1',
    'ZEUS_AI_WORKBENCH_PORT=8083',
    `ZEUS_ADMIN_DATA_DIR=${path.join(dataRoot, 'admin')}`,
    `ZEUS_AI_DATA_DIR=${path.join(dataRoot, 'ai')}`,
    'ZEUS_ADMIN_EMAIL=acceptance@example.test',
    `ZEUS_ADMIN_PASSWORD=${ADMIN_PASSWORD}`,
    `ZEUS_ADMIN_VIEWER_PASSWORD=${VIEWER_PASSWORD}`,
    'ZEUS_ADMIN_SEED_DEMO=true',
    'ZEUS_ADMIN_BOOTSTRAP=true',
    'ZEUS_AI_ORIGINS=http://127.0.0.1:8083',
    ...ai.lines,
    `# ui commit ${uiCommit}`,
    '',
  ]
  fs.writeFileSync(file, lines.join('\n'))
}

function dockerCompose(
  args: readonly string[],
  composeFile: string,
  envFile: string,
  required = true,
): void {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--project-name',
      PROJECT,
      '--env-file',
      envFile,
      '-f',
      composeFile,
      ...args,
    ],
    { cwd: repoRoot, stdio: 'inherit' },
  )
  if (required && result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed`)
  }
}

async function waitForHealth(
  composeFile: string,
  envFile: string,
): Promise<void> {
  const targets = [
    'http://127.0.0.1:8080/',
    'http://127.0.0.1:8081/sandbox.html',
    'http://127.0.0.1:8082/api/health',
    'http://127.0.0.1:8083/ai-host/health',
  ]
  for (const target of targets) {
    let ok = false
    let detail = 'no response'
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(target)
        detail = `${response.status} ${(await response.text()).slice(0, 200)}`
        if (response.ok) {
          ok = true
          break
        }
      } catch (error) {
        detail = error instanceof Error ? error.message : String(error)
      }
      await new Promise(resolve => setTimeout(resolve, 2_000))
    }
    if (!ok) {
      const logs = spawnSync(
        'docker',
        [
          'compose',
          '--project-name',
          PROJECT,
          '--env-file',
          envFile,
          '-f',
          composeFile,
          'logs',
          '--no-color',
          '--tail',
          '80',
          'ai-host',
          'ai-workbench',
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      )
      throw new Error(
        `health check failed: ${target}: ${detail}${logs.stdout ? `\n${logs.stdout}` : ''}`,
      )
    }
  }
}

function readExistingImages(output: string): Record<string, ImageRecord> {
  const candidate = JSON.parse(
    fs.readFileSync(path.join(output, 'deployment-candidate.json'), 'utf8'),
  ) as { images: Record<string, ImageRecord> }
  return candidate.images
}

function assertClean(
  directory: string,
  label: string,
  nestedWorktree?: string,
): void {
  const relativeNested = nestedWorktree
    ? path.relative(directory, nestedWorktree).split(path.sep).join('/')
    : undefined
  const status = git(directory, ['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .filter(line => {
      if (!relativeNested || relativeNested.startsWith('..')) return true
      const changed = line.slice(3).replace(/\/$/, '')
      return (
        changed !== relativeNested && !changed.startsWith(`${relativeNested}/`)
      )
    })
  if (status.length > 0) {
    throw new Error(
      `${label} worktree must be clean before Stage 1: ${status[0]}`,
    )
  }
}

function run(
  command: string,
  args: readonly string[],
  allowFailure = false,
): string {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}`)
  }
  return result.stdout
}

function git(directory: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
