import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import semver from 'semver'

export interface ReleaseTagContext {
  refName: string | undefined
  workflowSha: string | undefined
  checkoutSha: string
  version: string
  isMainAncestor: boolean
}

export function verifyReleaseTagSource(context: ReleaseTagContext): void {
  const parsed = semver.parse(context.version)
  if (!parsed) throw new Error(`Invalid release version: ${context.version}`)

  const prereleaseChannel = parsed.prerelease[0]
  if (
    prereleaseChannel !== undefined &&
    !['alpha', 'beta', 'rc'].includes(String(prereleaseChannel))
  ) {
    throw new Error(
      `Unsupported release prerelease channel: ${String(prereleaseChannel)}`,
    )
  }

  const expectedRef = `v${context.version}`
  if (context.refName !== expectedRef) {
    throw new Error(
      `Release ref ${context.refName ?? '<missing>'} does not match ${expectedRef}`,
    )
  }
  if (!context.workflowSha)
    throw new Error('GITHUB_SHA is required for release')
  if (normalizeSha(context.checkoutSha) !== normalizeSha(context.workflowSha)) {
    throw new Error('Release checkout does not match GITHUB_SHA')
  }
  if (!context.isMainAncestor) {
    throw new Error(
      `Release tag ${expectedRef} is not reachable from origin/main`,
    )
  }
}

function normalizeSha(value: string): string {
  const sha = value.trim().toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Invalid git SHA: ${value}`)
  return sha
}

function readGit(args: string[]): string {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
}

function isAncestor(commit: string, reference: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, reference], {
      cwd: process.cwd(),
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`)
  return value
}

function main(): void {
  const version = readOption('--version')
  if (!version) {
    throw new Error('Usage: release:verify:tag-source --version <version>')
  }

  execFileSync(
    'git',
    [
      'fetch',
      '--no-tags',
      'origin',
      '+refs/heads/main:refs/remotes/origin/main',
    ],
    { cwd: process.cwd(), stdio: 'inherit' },
  )
  const checkoutSha = readGit(['rev-parse', 'HEAD'])

  verifyReleaseTagSource({
    refName: process.env.GITHUB_REF_NAME,
    workflowSha: process.env.GITHUB_SHA,
    checkoutSha,
    version,
    isMainAncestor: isAncestor(checkoutSha, 'origin/main'),
  })

  console.log(
    `[release] ${process.env.GITHUB_REF_NAME} is reachable from origin/main`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
