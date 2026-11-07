import { randomBytes } from 'node:crypto'

/**
 * Builds the AI Host and Workbench runtime contract for a deployment.
 * The Workbench always receives a viewer-only upstream token and, for public
 * deployments, the Host runs in public-replay mode: every mutating command is
 * rejected, so the shared token can never write into a workspace or a stream
 * that another anonymous visitor can read. A separate token with write roles
 * is never placed in the Workbench proxy.
 */
export interface AiDeploymentEnvironment {
  readonly token: string
  readonly lines: readonly string[]
}

export interface AiDeploymentOptions {
  /** Public deployments must be strictly non-writable. Default true. */
  readonly publicReplay?: boolean
}

export function createAiDeploymentEnvironment(
  tenant: string,
  options: AiDeploymentOptions = {},
): AiDeploymentEnvironment {
  const publicReplay = options.publicReplay ?? true
  const token = randomBytes(32).toString('hex')
  const tokens = JSON.stringify([
    {
      token,
      tenantId: tenant,
      userId: 'workbench-viewer',
      role: 'viewer',
    },
  ])
  const tenants = JSON.stringify([
    {
      id: tenant,
      databaseFile: '/data/ai.sqlite',
      workspaceRoot: '/data/workspace',
    },
  ])
  return {
    token,
    lines: [
      'ZEUS_AI_MODE=replay',
      `ZEUS_AI_PUBLIC_REPLAY=${publicReplay ? 'true' : 'false'}`,
      `ZEUS_AI_TOKENS='${tokens}'`,
      `ZEUS_AI_TENANTS='${tenants}'`,
      `ZEUS_AI_UPSTREAM_TOKEN=${token}`,
    ],
  }
}
