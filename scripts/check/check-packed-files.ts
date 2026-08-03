import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

interface NpmPackResult {
  files: Array<{ path: string }>
}

interface Command {
  command: string
  args: string[]
}

const npmPackArgs = [
  'pack',
  '--dry-run',
  '--json',
  '--ignore-scripts',
  '--loglevel=error',
]

export function findMissingPackedFiles(
  packedFiles: readonly string[],
  requiredFiles: readonly string[],
): string[] {
  const packed = new Set(packedFiles.map(normalizePackagePath))
  const required = new Set(requiredFiles.map(normalizePackagePath))

  return [...required].filter(file => !packed.has(file))
}

export function readPackedFiles(packageDir: string): string[] {
  const { command, args } = resolveNpmPackCommand()
  const output = execFileSync(command, args, {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const results = JSON.parse(output) as NpmPackResult[]
  const files = results[0]?.files

  if (!Array.isArray(files)) {
    throw new Error(`npm pack returned no file list for ${packageDir}`)
  }

  return files.map(file => file.path)
}

export function resolveNpmPackCommand(
  platform: NodeJS.Platform = process.platform,
  commandInterpreter = process.env.ComSpec ?? process.env.COMSPEC,
): Command {
  if (platform === 'win32') {
    return {
      command: commandInterpreter ?? 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm', ...npmPackArgs],
    }
  }

  return {
    command: 'npm',
    args: [...npmPackArgs],
  }
}

function normalizePackagePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [packageDirArg, ...requiredFiles] = process.argv.slice(2)

  if (!packageDirArg || requiredFiles.length === 0) {
    throw new Error(
      'Usage: check-packed-files <package-dir> <required-file> [...]',
    )
  }

  const packageDir = path.resolve(packageDirArg)
  const missingFiles = findMissingPackedFiles(
    readPackedFiles(packageDir),
    requiredFiles,
  )

  if (missingFiles.length > 0) {
    throw new Error(
      `Package ${path.relative(process.cwd(), packageDir)} is missing packed files: ${missingFiles.join(', ')}`,
    )
  }

  console.log(
    `Packed files verified for ${path.relative(process.cwd(), packageDir)}`,
  )
}
