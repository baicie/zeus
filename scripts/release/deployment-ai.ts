import { randomBytes } from 'node:crypto'

/**
 * Builds the AI Host and Workbench runtime contract for a local deployment
 * rehearsal. The Workbench always receives a viewer-only upstream token:
 * anonymous visitors share that token but cannot propose changes, approve or
 * upload assets. A separate token with write roles is never placed in the
 * Workbench proxy.
 */
export interface AiDeploymentEnvironment {
  readonly token: string
  readonly lines: readonly string[]
}

export function createAiDeploymentEnvironment(
  tenant: string,
): AiDeploymentEnvironment {
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
      `ZEUS_AI_TOKENS='${tokens}'`,
      `ZEUS_AI_TENANTS='${tenants}'`,
      `ZEUS_AI_UPSTREAM_TOKEN=${token}`,
    ],
  }
}
