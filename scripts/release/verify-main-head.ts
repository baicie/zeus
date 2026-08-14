import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export interface MainHeadContext {
  eventName: string | undefined
  ref: string | undefined
  workflowSha: string | undefined
  checkoutSha: string
  remoteMainSha: string
}

export function verifyMainHead(context: MainHeadContext): void {
  if (!['push', 'workflow_dispatch'].includes(context.eventName ?? '')) {
    throw new Error(
      `Canary publication is not allowed for event ${context.eventName ?? '<missing>'}`,
    )
  }
  if (context.ref !== 'refs/heads/main') {
    throw new Error(
      `Canary publication is only allowed from refs/heads/main, received ${context.ref ?? '<missing>'}`,
    )
  }
  if (!context.workflowSha) {
    throw new Error('GITHUB_SHA is required for Canary publication')
  }

  const workflowSha = normalizeSha(context.workflowSha)
  const checkoutSha = normalizeSha(context.checkoutSha)
  const remoteMainSha = normalizeSha(context.remoteMainSha)

  if (checkoutSha !== workflowSha) {
    throw new Error(
      `Checked out SHA ${checkoutSha} does not match workflow SHA ${workflowSha}`,
    )
  }
  if (remoteMainSha !== workflowSha) {
    throw new Error(
      `Workflow SHA ${workflowSha} is stale; origin/main is ${remoteMainSha}`,
    )
  }
}

function normalizeSha(value: string): string {
  const sha = value.trim().toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Invalid git SHA: ${value}`)
  }
  return sha
}

function readGit(args: string[]): string {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
}

export function verifyCurrentMainHead(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const remote = readGit([
    'ls-remote',
    '--exit-code',
    'origin',
    'refs/heads/main',
  ])
  const remoteMainSha = remote.split(/\s+/)[0] ?? ''

  verifyMainHead({
    eventName: environment.GITHUB_EVENT_NAME,
    ref: environment.GITHUB_REF,
    workflowSha: environment.GITHUB_SHA,
    checkoutSha: readGit(['rev-parse', 'HEAD']),
    remoteMainSha,
  })

  console.log(`[release] main publish head verified: ${remoteMainSha}`)
  return remoteMainSha
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  verifyCurrentMainHead()
}
