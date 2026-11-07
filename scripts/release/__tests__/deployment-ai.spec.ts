import { describe, expect, it } from 'vitest'

import { createAiDeploymentEnvironment } from '../deployment-ai'

function parseEnv(lines: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    lines.map(line => {
      const index = line.indexOf('=')
      const key = line.slice(0, index)
      const value = line.slice(index + 1)
      return [
        key,
        value.startsWith("'") && value.endsWith("'")
          ? value.slice(1, -1)
          : value,
      ]
    }),
  )
}

describe('AI deployment environment', () => {
  it('pins replay mode and a viewer-only workbench token', () => {
    const environment = createAiDeploymentEnvironment('stage1-local')
    const env = parseEnv(environment.lines)
    expect(env.ZEUS_AI_MODE).toBe('replay')
    expect(env.ZEUS_AI_PUBLIC_REPLAY).toBe('true')
    expect(env.ZEUS_AI_UPSTREAM_TOKEN).toBe(environment.token)
    expect(environment.token).toMatch(/^[0-9a-f]{64}$/)
    const tokens = JSON.parse(env.ZEUS_AI_TOKENS!) as Array<{
      token: string
      tenantId: string
      role: string
    }>
    expect(tokens).toEqual([
      {
        token: environment.token,
        tenantId: 'stage1-local',
        userId: 'workbench-viewer',
        role: 'viewer',
      },
    ])
    const tenants = JSON.parse(env.ZEUS_AI_TENANTS!) as Array<{
      id: string
      databaseFile: string
      workspaceRoot: string
    }>
    expect(tenants).toEqual([
      {
        id: 'stage1-local',
        databaseFile: '/data/ai.sqlite',
        workspaceRoot: '/data/workspace',
      },
    ])
  })

  it('generates a different token for each environment', () => {
    expect(createAiDeploymentEnvironment('tenant-a').token).not.toBe(
      createAiDeploymentEnvironment('tenant-a').token,
    )
  })
})
