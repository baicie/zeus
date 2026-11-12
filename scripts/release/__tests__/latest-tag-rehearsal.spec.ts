/**
 * Isolated registry rehearsal for the RC dist-tag gate.
 *
 * A real HTTP mock registry runs in its own process and the real `npm view`
 * CLI is executed against it. This exercises the same synchronous npm code
 * path the release precheck uses, including npm's own error handling, rather
 * than mocking the query function. Each case gets a fresh registry process so
 * retry counters and failures cannot leak between cases.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { zeusFixedPackages } from '../../release.config'
import { evaluateLatestTags, readLatestTag } from '../check-latest-tags'

interface Registry {
  readonly url: string
  hits(): Promise<Record<string, number>>
  stop(): void
}

async function startRegistry(
  packages: Record<string, unknown>,
): Promise<Registry> {
  const script = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'support',
    'mock-registry.mjs',
  )
  const child: ChildProcess = spawn(
    process.execPath,
    [script, JSON.stringify(packages)],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('mock registry did not start')),
      10000,
    )
    child.stdout!.on('data', chunk => {
      const match = /PORT (\d+)/.exec(String(chunk))
      if (match) {
        clearTimeout(timer)
        resolve(`http://127.0.0.1:${match[1]}`)
      }
    })
    child.once('exit', code =>
      reject(new Error(`mock registry exited with ${code}`)),
    )
  })
  return {
    url,
    async hits() {
      const response = await fetch(`${url}/__hits`)
      return (await response.json()) as Record<string, number>
    },
    stop() {
      child.kill()
    },
  }
}

describe('dist-tag gate against an isolated registry', () => {
  it('classifies every fixed package and fails on a prerelease latest', async () => {
    const packages: Record<string, unknown> = {}
    zeusFixedPackages.forEach((name, index) => {
      if (name === '@zeus-js/query') {
        packages[name] = { latest: '0.1.1-beta.20' }
      } else if (index % 7 === 0) {
        // Unpublished package: explicit 404.
      } else {
        packages[name] = { latest: '0.1.0' }
      }
    })
    const registry = await startRegistry(packages)
    try {
      const records = []
      for (const name of zeusFixedPackages) {
        records.push({
          name,
          state: await readLatestTag(name, {
            registry: registry.url,
            attempts: 2,
          }),
        })
      }
      const evaluation = evaluateLatestTags(records)
      // Derived, not hardcoded: adding a package to the fixed group should not
      // require editing an assertion, and a count that silently drifts with the
      // list it is meant to check is not a check.
      expect(records).toHaveLength(zeusFixedPackages.length)
      expect(evaluation.prerelease).toEqual(['@zeus-js/query'])
      expect(evaluation.errors).toContain(
        '@zeus-js/query: latest points at prerelease 0.1.1-beta.20; run pnpm repair:latest-tags',
      )
      expect(evaluation.failures).toEqual([])
      expect(evaluation.absent.length).toBeGreaterThan(0)
    } finally {
      registry.stop()
    }
  }, 120000)

  it('fails closed when the registry returns 503 everywhere', async () => {
    const registry = await startRegistry({
      '@zeus-js/shared': { status: 503 },
      '@zeus-js/zeus': { status: 503 },
    })
    try {
      const shared = await readLatestTag('@zeus-js/shared', {
        registry: registry.url,
        attempts: 2,
      })
      const zeus = await readLatestTag('@zeus-js/zeus', {
        registry: registry.url,
        attempts: 2,
      })
      expect(shared.status).toBe('REGISTRY_QUERY_FAILED')
      expect(zeus.status).toBe('REGISTRY_QUERY_FAILED')
      expect(
        evaluateLatestTags([
          { name: '@zeus-js/shared', state: shared },
          { name: '@zeus-js/zeus', state: zeus },
        ]).failures,
      ).toEqual(['@zeus-js/shared', '@zeus-js/zeus'])
    } finally {
      registry.stop()
    }
  }, 60000)

  it('recovers after transient registry failures with bounded retries', async () => {
    const registry = await startRegistry({
      '@zeus-js/runtime-dom': {
        latest: '0.1.0',
        failuresBeforeSuccess: 2,
      },
    })
    try {
      const result = await readLatestTag('@zeus-js/runtime-dom', {
        registry: registry.url,
        attempts: 3,
        retryDelayMs: 1,
      })
      expect(result).toEqual({ status: 'LATEST_STABLE', version: '0.1.0' })
      expect((await registry.hits())['@zeus-js/runtime-dom']).toBe(3)
    } finally {
      registry.stop()
    }
  }, 60000)

  it('does not retry an explicit 404', async () => {
    const registry = await startRegistry({})
    try {
      const result = await readLatestTag('@zeus-js/never-published', {
        registry: registry.url,
        attempts: 3,
      })
      expect(result.status).toBe('LATEST_ABSENT')
      expect((await registry.hits())['@zeus-js/never-published']).toBe(1)
    } finally {
      registry.stop()
    }
  }, 30000)

  it('reports a partial registry outage as a blocking failure, not absent', async () => {
    const registry = await startRegistry({
      '@zeus-js/shared': { latest: '0.1.0' },
      '@zeus-js/signal': { status: 500 },
    })
    try {
      const records = []
      for (const name of [
        '@zeus-js/shared',
        '@zeus-js/signal',
        '@zeus-js/absent',
      ]) {
        records.push({
          name,
          state: await readLatestTag(name, {
            registry: registry.url,
            attempts: 2,
          }),
        })
      }
      const evaluation = evaluateLatestTags(records)
      expect(evaluation.stable).toEqual(['@zeus-js/shared'])
      expect(evaluation.absent).toEqual(['@zeus-js/absent'])
      expect(evaluation.failures).toEqual(['@zeus-js/signal'])
      expect(evaluation.errors).toHaveLength(1)
    } finally {
      registry.stop()
    }
  }, 60000)
})
