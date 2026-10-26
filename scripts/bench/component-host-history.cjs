const WORKFLOW = 'component-host-bench.yml'
const WORKFLOW_PATH = `.github/workflows/${WORKFLOW}`
const ARTIFACT_NAME = 'component-host-benchmark'

async function findBenchmarkHistory({
  github,
  owner,
  repo,
  currentRunId,
  log,
}) {
  for (let page = 1; ; page++) {
    const { data } = await github.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: WORKFLOW,
      branch: 'main',
      event: 'push',
      status: 'success',
      per_page: 100,
      page,
    })
    const runs = data.workflow_runs
      .filter(
        run =>
          run.id !== currentRunId &&
          run.path === WORKFLOW_PATH &&
          run.head_branch === 'main' &&
          run.event === 'push' &&
          run.status === 'completed' &&
          run.conclusion === 'success',
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)

    for (const run of runs) {
      for (let artifactPage = 1; ; artifactPage++) {
        const { data: artifacts } =
          await github.rest.actions.listWorkflowRunArtifacts({
            owner,
            repo,
            run_id: run.id,
            per_page: 100,
            page: artifactPage,
          })
        const artifact = artifacts.artifacts.find(
          artifact =>
            artifact.name === ARTIFACT_NAME &&
            !artifact.expired &&
            artifact.size_in_bytes > 0,
        )
        if (artifact) {
          log(
            `Restoring benchmark history from run ${run.id} (${run.head_sha}), artifact ${artifact.id}.`,
          )
          return {
            runId: run.id,
            headSha: run.head_sha,
            artifactId: artifact.id,
          }
        }
        if (artifacts.artifacts.length < 100) break
      }
      log(
        `Benchmark run ${run.id} has no retained ${ARTIFACT_NAME} artifact; checking earlier benchmark runs.`,
      )
    }
    if (data.workflow_runs.length < 100) {
      log(
        'No retained successful main benchmark history exists; starting the first available trend point.',
      )
      return undefined
    }
  }
}

function assertBenchmarkHistory(history, expectedSha) {
  if (
    history?.schemaVersion !== 1 ||
    !Array.isArray(history.commits) ||
    !history.commits.some(report => report.git?.sha === expectedSha)
  ) {
    throw new Error(
      `Benchmark trend does not contain the expected source commit ${expectedSha}.`,
    )
  }
}

module.exports = { findBenchmarkHistory, assertBenchmarkHistory }
