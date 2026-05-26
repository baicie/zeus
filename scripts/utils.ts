import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'

import pico from 'picocolors'

export type MarkRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>
export type PackageFormat =
  | 'cjs'
  | 'esm-bundler'
  | 'global'
  | 'global-runtime'
  | 'esm-browser'
  | 'esm-bundler-runtime'
  | 'esm-browser-runtime'

const require = createRequire(import.meta.url)

export const targets: string[] = fs.readdirSync('packages').filter(f => {
  if (
    !fs.statSync(`packages/${f}`).isDirectory() ||
    !fs.existsSync(`packages/${f}/package.json`)
  ) {
    return false
  }
  const pkg = require(`../packages/${f}/package.json`)
  if (pkg.private || !pkg.buildOptions) {
    return false
  }
  return true
})

export function fuzzyMatchTarget(
  partialTargets: ReadonlyArray<string>,
  includeAllMatching: boolean | undefined,
): string[] {
  const matched: string[] = []
  partialTargets.forEach(partialTarget => {
    for (const target of targets) {
      if (target.match(partialTarget)) {
        matched.push(target)
        if (!includeAllMatching) {
          break
        }
      }
    }
  })
  if (matched.length) {
    return matched
  } else {
    console.log()
    console.error(
      `  ${pico.white(pico.bgRed(' ERROR '))} ${pico.red(
        `Target ${pico.underline(partialTargets.toString())} not found!`,
      )}`,
    )
    console.log()

    process.exit(1)
  }
}

export async function exec(
  command: string,
  args: ReadonlyArray<string>,
  options: object,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32'
    const normalizedArgs = args.filter(Boolean)

    const spawnCommand = isWin ? 'cmd.exe' : command
    const spawnArgs = isWin
      ? ['/d', '/s', '/c', command, ...normalizedArgs]
      : normalizedArgs

    const _process = spawn(spawnCommand, spawnArgs, {
      stdio: [
        'ignore', // stdin
        'pipe', // stdout
        'pipe', // stderr
      ],
      ...options,
      shell: false,
    })

    const stderrChunks: Buffer[] = []
    const stdoutChunks: Buffer[] = []

    _process.stderr?.on('data', chunk => {
      stderrChunks.push(chunk)
    })

    _process.stdout?.on('data', chunk => {
      stdoutChunks.push(chunk)
    })

    _process.on('error', error => {
      reject(error)
    })

    _process.on('exit', code => {
      const ok = code === 0
      const stderr = Buffer.concat(stderrChunks).toString().trim()
      const stdout = Buffer.concat(stdoutChunks).toString().trim()

      if (ok) {
        const result = { ok, code, stderr, stdout }
        resolve(result)
      } else {
        reject(
          new Error(
            `Failed to execute command: ${command} ${normalizedArgs.join(
              ' ',
            )}: ${stderr || stdout}`,
          ),
        )
      }
    })
  })
}
