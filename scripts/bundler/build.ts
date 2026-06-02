import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import pico from 'picocolors'
import prettyBytes from 'pretty-bytes'

import { scanEnums } from './inline-enums'
import {
  targets as allTargets,
  exec,
  fuzzyMatchTarget,
  resolvePackageDir,
} from '../shared/utils'

const commit = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'])
  .stdout.toString()
  .trim()

const { values, positionals: targets } = parseArgs({
  allowPositionals: true,
  options: {
    formats: {
      type: 'string',
      short: 'f',
    },
    devOnly: {
      type: 'boolean',
      short: 'd',
    },
    prodOnly: {
      type: 'boolean',
      short: 'p',
    },
    withTypes: {
      type: 'boolean',
      short: 't',
    },
    sourceMap: {
      type: 'boolean',
      short: 's',
    },
    release: {
      type: 'boolean',
    },
    all: {
      type: 'boolean',
      short: 'a',
    },
    size: {
      type: 'boolean',
    },
    watch: {
      type: 'boolean',
      short: 'w',
    },
  },
})

if (values.watch && values.sourceMap === undefined) {
  values.sourceMap = true
}

const {
  formats,
  all: buildAllMatching,
  devOnly,
  prodOnly,
  withTypes: buildTypes,
  sourceMap,
  release: isRelease,
  size: writeSize,
  watch,
} = values

const sizeDir = path.resolve('temp/size')

run()

async function run() {
  if (writeSize) fs.mkdirSync(sizeDir, { recursive: true })
  const removeCache = scanEnums()
  try {
    const resolvedTargets = targets.length
      ? fuzzyMatchTarget(targets, buildAllMatching)
      : allTargets
    if (watch && buildTypes) {
      runDtsInBackground(resolvedTargets)
    }
    await buildAll(resolvedTargets)
    await checkAllSizes(resolvedTargets)
    if (!watch && buildTypes) {
      await exec(
        'pnpm',
        [
          'run',
          'build-dts',
          ...(targets.length
            ? ['--environment', `TARGETS:${resolvedTargets.join(',')}`]
            : []),
        ],
        {
          stdio: 'inherit',
        },
      )
    }
  } finally {
    // Cache must be removed after build-dts since it depends on enum cache
  }
  removeCache()
}

function runDtsInBackground(resolvedTargets: string[]): void {
  console.log(`${pico.cyan('[build-dts]')} spawning in background...`)

  const args = [
    'run',
    'build-dts',
    ...(resolvedTargets.length
      ? ['--environment', `TARGETS:${resolvedTargets.join(',')}`]
      : []),
  ]

  exec('pnpm', args, { stdio: 'pipe' })
    .then(() => {
      console.log(`${pico.green('[build-dts]')} background dts build finished`)
    })
    .catch(err => {
      console.error(`${pico.red('[build-dts]')} ${err.message}`)
    })
}

async function buildAll(targets: string[]): Promise<void> {
  // Rolldown 1.0.3 transpiles TS config files through a shared temporary
  // config filename. Loading the same TS config from multiple CLI processes
  // races and can delete the temp file while another process imports it.
  await runParallel(1, targets, build)
}

async function runParallel<T>(
  maxConcurrency: number,
  source: Array<T>,
  iteratorFn: (item: T) => Promise<void>,
): Promise<void[]> {
  const ret: Promise<void>[] = []
  const executing: Promise<void>[] = []
  for (const item of source) {
    const p = Promise.resolve().then(() => iteratorFn(item))
    ret.push(p)

    if (maxConcurrency <= source.length) {
      const e = p.then(() => {
        executing.splice(executing.indexOf(e), 1)
      })
      executing.push(e)
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing)
      }
    }
  }
  return Promise.all(ret)
}

async function build(target: string): Promise<void> {
  const pkgDir = resolvePackageDir(target)
  if (!pkgDir) {
    throw new Error(`Cannot resolve directory for package: ${target}`)
  }
  const pkg = JSON.parse(readFileSync(`${pkgDir}/package.json`, 'utf-8'))

  // if this is a full build (no specific targets), ignore private packages
  if ((isRelease || !targets.length) && pkg.private) {
    return
  }

  // if building a specific format, do not remove dist.
  if (!formats && existsSync(`${pkgDir}/dist`)) {
    fs.rmSync(`${pkgDir}/dist`, { recursive: true })
  }

  const env =
    (pkg.buildOptions && pkg.buildOptions.env) ||
    (devOnly ? 'development' : 'production')

  await exec(
    'rolldown',
    [
      '-c',
      './scripts/bundler/rolldown.config.ts',
      '--environment',
      [
        `COMMIT:${commit}`,
        `NODE_ENV:${env}`,
        `TARGET:${target}`,
        formats ? `FORMATS:${encodeURIComponent(formats)}` : ``,
        prodOnly ? `PROD_ONLY:true` : ``,
        sourceMap ? `SOURCE_MAP:true` : ``,
      ]
        .filter(Boolean)
        .join(','),
      watch ? `--watch` : ``,
    ],
    { stdio: 'inherit' },
  )
}

async function checkAllSizes(targets: string[]): Promise<void> {
  if (devOnly || (formats && !formats.includes('global'))) {
    return
  }
  console.log()
  for (const target of targets) {
    await checkSize(target)
  }
  console.log()
}

async function checkSize(target: string): Promise<void> {
  const pkgDir = resolvePackageDir(target)
  if (!pkgDir) return
  await checkFileSize(`${pkgDir}/dist/${target}.global.prod.js`)
  if (!formats || formats.includes('global-runtime')) {
    await checkFileSize(`${pkgDir}/dist/${target}.runtime.global.prod.js`)
  }
}

async function checkFileSize(filePath: string): Promise<void> {
  if (!existsSync(filePath)) {
    return
  }
  const file = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)

  const gzipped = gzipSync(file)
  const brotli = brotliCompressSync(file)

  console.log(
    `${pico.gray(pico.bold(fileName))} min:${prettyBytes(
      file.length,
    )} / gzip:${prettyBytes(gzipped.length)} / brotli:${prettyBytes(
      brotli.length,
    )}`,
  )

  if (writeSize)
    fs.writeFileSync(
      path.resolve(sizeDir, `${fileName}.json`),
      JSON.stringify({
        file: fileName,
        size: file.length,
        gzip: gzipped.length,
        brotli: brotli.length,
      }),
      'utf-8',
    )
}
