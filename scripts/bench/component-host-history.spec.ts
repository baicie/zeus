import { createRequire } from 'node:module'

import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { findBenchmarkHistory, assertBenchmarkHistory } =
  require('./component-host-history.cjs') as {
    findBenchmarkHistory(options: {
      github: ReturnType<typeof api>
      owner: string
      repo: string
      currentRunId: number
      log: (message: string) => void
    }): Promise<
      { runId: number; headSha: string; artifactId: number } | undefined
    >
    assertBenchmarkHistory(history: unknown, expectedSha: string): void
  }

const request = { owner: 'owner', repo: 'repo', currentRunId: 10, log: vi.fn() }
const run = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  path: '.github/workflows/component-host-bench.yml',
  head_branch: 'main',
  head_sha: String(id).repeat(40),
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  created_at: `2026-10-${String(id).padStart(2, '0')}T00:00:00Z`,
  ...overrides,
})
const artifact = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name: 'component-host-benchmark',
  expired: false,
  size_in_bytes: 100,
  ...overrides,
})

function api() {
  return {
    rest: {
      actions: {
        listWorkflowRuns: vi
          .fn()
          .mockResolvedValue({ data: { workflow_runs: [] } }),
        listWorkflowRunArtifacts: vi
          .fn()
          .mockResolvedValue({ data: { artifacts: [] } }),
      },
    },
  }
}

describe('component-host benchmark history selection', () => {
  it('uses the workflow endpoint and restores only a successful main push with its artifact', async () => {
    const github = api()
    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: {
        workflow_runs: [
          run(10),
          run(9, { path: '.github/workflows/docs.yml' }),
          run(8, { head_branch: 'feature' }),
          run(7, { event: 'pull_request' }),
          run(6, { conclusion: 'failure' }),
          run(5, { status: 'in_progress' }),
          run(4),
        ],
      },
    })
    github.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({
      data: { artifacts: [artifact(42)] },
    })
    await expect(findBenchmarkHistory({ ...request, github })).resolves.toEqual(
      {
        runId: 4,
        headSha: '4'.repeat(40),
        artifactId: 42,
      },
    )
    expect(github.rest.actions.listWorkflowRuns).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      workflow_id: 'component-host-bench.yml',
      branch: 'main',
      event: 'push',
      status: 'success',
      per_page: 100,
      page: 1,
    })
    expect(github.rest.actions.listWorkflowRunArtifacts).toHaveBeenCalledTimes(
      1,
    )
    expect(github.rest.actions.listWorkflowRunArtifacts).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      run_id: 4,
      per_page: 100,
      page: 1,
    })
  })

  it('skips missing, expired and empty artifacts in favor of the latest usable benchmark', async () => {
    const github = api()
    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: [run(1), run(4), run(3), run(2)] },
    })
    github.rest.actions.listWorkflowRunArtifacts
      .mockResolvedValueOnce({
        data: { artifacts: [artifact(44, { expired: true })] },
      })
      .mockResolvedValueOnce({
        data: { artifacts: [artifact(33, { size_in_bytes: 0 })] },
      })
      .mockResolvedValueOnce({
        data: { artifacts: [artifact(22, { name: 'docs' })] },
      })
      .mockResolvedValueOnce({ data: { artifacts: [artifact(11)] } })
    await expect(
      findBenchmarkHistory({ ...request, github }),
    ).resolves.toMatchObject({ runId: 1, artifactId: 11 })
    expect(
      github.rest.actions.listWorkflowRunArtifacts.mock.calls.map(
        ([args]) => args.run_id,
      ),
    ).toEqual([4, 3, 2, 1])
  })

  it('paginates benchmark runs and artifact listings', async () => {
    const github = api()
    github.rest.actions.listWorkflowRuns
      .mockResolvedValueOnce({
        data: { workflow_runs: Array.from({ length: 100 }, () => run(10)) },
      })
      .mockResolvedValueOnce({ data: { workflow_runs: [run(1)] } })
    github.rest.actions.listWorkflowRunArtifacts
      .mockResolvedValueOnce({
        data: {
          artifacts: Array.from({ length: 100 }, (_, i) =>
            artifact(i, { name: 'other' }),
          ),
        },
      })
      .mockResolvedValueOnce({ data: { artifacts: [artifact(11)] } })
    await expect(
      findBenchmarkHistory({ ...request, github }),
    ).resolves.toMatchObject({ runId: 1, artifactId: 11 })
    expect(
      github.rest.actions.listWorkflowRuns.mock.calls.map(
        ([args]) => args.page,
      ),
    ).toEqual([1, 2])
    expect(
      github.rest.actions.listWorkflowRunArtifacts.mock.calls.map(
        ([args]) => args.page,
      ),
    ).toEqual([1, 2])
  })

  it('announces the absence of retained history instead of pretending restoration succeeded', async () => {
    const github = api()
    const log = vi.fn()
    await expect(
      findBenchmarkHistory({ ...request, github, log }),
    ).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('starting the first available trend point'),
    )
  })

  it('propagates repository and artifact API failures', async () => {
    const github = api()
    const failure = new Error('403 Forbidden')
    github.rest.actions.listWorkflowRuns.mockRejectedValueOnce(failure)
    await expect(findBenchmarkHistory({ ...request, github })).rejects.toBe(
      failure,
    )
    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: [run(1)] },
    })
    github.rest.actions.listWorkflowRunArtifacts.mockRejectedValueOnce(failure)
    await expect(findBenchmarkHistory({ ...request, github })).rejects.toBe(
      failure,
    )
  })

  it('requires the restored and final trends to contain their source commits', () => {
    const history = {
      schemaVersion: 1,
      commits: [{ git: { sha: 'old' } }, { git: { sha: 'new' } }],
    }
    expect(() => assertBenchmarkHistory(history, 'old')).not.toThrow()
    expect(() => assertBenchmarkHistory(history, 'new')).not.toThrow()
    expect(() => assertBenchmarkHistory(history, 'missing')).toThrow(
      'expected source commit',
    )
    expect(() =>
      assertBenchmarkHistory(
        { schemaVersion: 2, commits: history.commits },
        'old',
      ),
    ).toThrow()
    expect(() =>
      assertBenchmarkHistory({ schemaVersion: 1, commits: [] }, 'old'),
    ).toThrow()
  })
})
