import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import pico from 'picocolors'

import { zeusFixedPackages } from '../release.config'

const defaultRegistry = 'https://registry.npmjs.org'

export interface NpmReleaseAuthDependencies {
  packages: readonly string[]
  whoami: () => string
  readCollaborators: (
    pkg: string,
  ) => Readonly<Record<string, string | undefined>>
  readTwoFactorPolicy: () => string
}

export interface NpmReleaseAuthResult {
  username: string
  verifiedPackages: number
}

export function isCiEnvironment(
  environment: Readonly<NodeJS.ProcessEnv>,
): boolean {
  return environment.GITHUB_ACTIONS === 'true' || environment.CI === 'true'
}

export function resolveNpmAuthToken(
  environment: Readonly<NodeJS.ProcessEnv>,
): string | undefined {
  const token = [environment.NODE_AUTH_TOKEN, environment.NPM_TOKEN].find(
    value => value?.trim(),
  )
  if (isCiEnvironment(environment) && !token) {
    throw new Error('NODE_AUTH_TOKEN or NPM_TOKEN is required in CI')
  }
  return token
}

export function verifyNpmReleaseAuth(
  dependencies: NpmReleaseAuthDependencies,
): NpmReleaseAuthResult {
  if (dependencies.packages.length === 0) {
    throw new Error('at least one release package is required')
  }

  const username = dependencies.whoami().trim()
  if (!username) throw new Error('npm whoami returned an empty identity')

  const twoFactorPolicy = dependencies.readTwoFactorPolicy().trim()
  if (twoFactorPolicy !== 'auth-and-writes') {
    throw new Error(
      `npm release auth preflight failed: account 2FA policy is ${twoFactorPolicy || 'unset'}; expected auth-and-writes`,
    )
  }

  const errors: string[] = []
  for (const pkg of dependencies.packages) {
    const access = dependencies.readCollaborators(pkg)[username]
    if (access !== 'read-write') {
      errors.push(
        `${pkg}: ${username} has ${access ?? 'no'} access; expected read-write`,
      )
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `npm release auth preflight failed:\n- ${errors.join('\n- ')}`,
    )
  }

  return { username, verifiedPackages: dependencies.packages.length }
}

function main(): void {
  const registry = readOption('--registry') ?? defaultRegistry
  const authToken = resolveNpmAuthToken(process.env)

  const result = verifyNpmReleaseAuth({
    packages: zeusFixedPackages,
    whoami: () =>
      runNpm(
        ['whoami', '--registry', registry],
        'resolve npm identity',
        authToken,
      ),
    readTwoFactorPolicy: () => readTwoFactorPolicy(registry, authToken),
    readCollaborators: pkg =>
      JSON.parse(
        runNpm(
          [
            'access',
            'list',
            'collaborators',
            pkg,
            '--json',
            '--registry',
            registry,
          ],
          `read ${pkg} collaborators`,
          authToken,
        ),
      ) as Record<string, string>,
  })

  console.log(
    pico.green(
      `npm release auth passed (${result.username}, ${result.verifiedPackages} packages with read-write access).`,
    ),
  )
}

function readTwoFactorPolicy(registry: string, authToken?: string): string {
  const profile = JSON.parse(
    runNpm(
      ['profile', 'get', 'tfa', '--json', '--registry', registry],
      'read npm account 2FA policy',
      authToken,
    ),
  ) as { tfa?: unknown }
  if (typeof profile.tfa === 'string') return profile.tfa
  if (profile.tfa === false) return 'disabled'
  if (profile.tfa === true) return 'enabled'
  return ''
}

function runNpm(args: string[], label: string, authToken?: string): string {
  const environment = { ...process.env }
  if (authToken) environment.NODE_AUTH_TOKEN = authToken
  else delete environment.NODE_AUTH_TOKEN

  const result = spawnSync('npm', args, {
    cwd: process.cwd(),
    env: environment,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status ?? 'unknown'}): ${result.stderr || result.error?.message || 'unknown npm error'}`,
    )
  }
  return result.stdout.trim()
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
