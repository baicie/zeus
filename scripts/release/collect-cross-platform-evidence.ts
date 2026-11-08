/**
 * Collects cross-platform evidence from a real GitHub Actions CI run.
 *
 * The document is derived from the run's job and artifact metadata, not from
 * hand-written strings. Each platform must show real successful jobs, the test
 * categories those jobs executed, and the digest of the artifact they uploaded.
 * A compiler build on its own never satisfies this contract.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { fetchRunSnapshot } from './github-trust'
import {
  CROSS_PLATFORM_SCHEMA,
  REQUIRED_PLATFORM_TESTS,
  crossPlatformDigest,
  isRecord,
  type CrossPlatformEvidenceDocument,
  type CrossPlatformJobEvidence,
  type CrossPlatformArtifactEvidence,
  type CrossPlatformPlatformEvidence,
  type RequiredPlatform,
} from './rc-approval'

interface JobRequirement {
  readonly name: string
  readonly platformHint?: string
  readonly tested: readonly string[]
}

export const PLATFORM_JOBS: Record<
  RequiredPlatform,
  readonly JobRequirement[]
> = {
  linux: [
    {
      name: 'lint-and-check',
      tested: ['typecheck', 'lint', 'format', 'secret-scan'],
    },
    {
      name: 'packed-consumers',
      tested: ['unit', 'build', 'browser-e2e', 'packed-consumers'],
    },
    {
      name: 'create-zeus-candidates',
      platformHint: 'ubuntu-latest',
      tested: ['create-zeus', 'native-build', 'build', 'typecheck'],
    },
  ],
  win32: [
    {
      name: 'create-zeus-candidates',
      platformHint: 'windows-latest',
      tested: ['create-zeus', 'native-build', 'build', 'typecheck'],
    },
  ],
}

export const PLATFORM_ARTIFACTS: Record<RequiredPlatform, readonly string[]> = {
  linux: ['create-zeus-candidate-ubuntu-latest'],
  win32: ['create-zeus-candidate-windows-latest'],
}

export interface CollectCrossPlatformInput {
  readonly commit: string
  readonly workflow: string
  readonly workflowPath: string
  readonly workflowId: string
  readonly runId: string
  readonly runAttempt: string
  readonly event: string
  readonly jobs: readonly unknown[]
  readonly artifacts: readonly unknown[]
  readonly now?: number
  readonly maxAgeHours?: number
}

export interface CollectCrossPlatformResult {
  readonly document?: CrossPlatformEvidenceDocument
  readonly errors: readonly string[]
}

export function collectCrossPlatformEvidence(
  input: CollectCrossPlatformInput,
): CollectCrossPlatformResult {
  const errors: string[] = []
  if (!/^[0-9a-f]{40}$/i.test(input.commit)) {
    errors.push('commit must be a full 40-character SHA')
  }
  if (input.workflowPath !== '.github/workflows/ci.yml') {
    errors.push('workflowPath must be .github/workflows/ci.yml')
  }
  if (!/^\d+$/.test(input.workflowId)) {
    errors.push('workflowId must be numeric')
  }
  if (!/^\d+$/.test(input.runId)) errors.push('runId must be numeric')
  if (!/^\d+$/.test(input.runAttempt)) {
    errors.push('runAttempt must be numeric')
  }

  const jobList = input.jobs.filter(isRecord)
  const artifactList = input.artifacts.filter(isRecord)
  const platforms = {} as Record<
    RequiredPlatform,
    CrossPlatformPlatformEvidence
  >
  const now = input.now ?? Date.now()

  for (const platform of Object.keys(PLATFORM_JOBS) as RequiredPlatform[]) {
    const platformJobs: CrossPlatformJobEvidence[] = []
    const tested = new Set<string>()
    let completedAt = 0
    for (const requirement of PLATFORM_JOBS[platform]) {
      const job = findJob(jobList, requirement)
      if (!job) {
        errors.push(
          `cross-platform ${platform} is missing the ${requirement.name} job`,
        )
        continue
      }
      if (job.conclusion !== 'success') {
        errors.push(
          `cross-platform ${platform} ${requirement.name} conclusion is ${String(job.conclusion)}`,
        )
      }
      platformJobs.push({
        name: String(job.name),
        id: String(job.id),
        conclusion: 'success',
        tested: requirement.tested,
      })
      for (const name of requirement.tested) tested.add(name)
      const completed = Date.parse(String(job.completed_at ?? ''))
      if (Number.isFinite(completed))
        completedAt = Math.max(completedAt, completed)
    }
    for (const required of REQUIRED_PLATFORM_TESTS) {
      if (!tested.has(required)) {
        errors.push(
          `cross-platform ${platform} does not cover the ${required} test`,
        )
      }
    }

    const platformArtifacts: CrossPlatformArtifactEvidence[] = []
    for (const name of PLATFORM_ARTIFACTS[platform]) {
      const artifact = artifactList.find(entry => entry.name === name)
      if (!artifact) {
        errors.push(`cross-platform ${platform} is missing artifact ${name}`)
        continue
      }
      if (artifact.expired === true) {
        errors.push(`cross-platform ${platform} artifact ${name} has expired`)
      }
      const digest = String(artifact.digest ?? '')
      if (!/^sha256:[0-9a-f]{64}$/i.test(digest)) {
        errors.push(
          `cross-platform ${platform} artifact ${name} has no sha256 digest`,
        )
      }
      platformArtifacts.push({
        name,
        id: String(artifact.id),
        digest,
      })
    }

    platforms[platform] = {
      status: 'PASS',
      jobs: platformJobs,
      artifacts: platformArtifacts,
      tested: [...tested],
      sourceSha: input.commit,
      headSha: input.commit,
      completedAt:
        completedAt > 0
          ? new Date(completedAt).toISOString()
          : new Date(now).toISOString(),
    }
  }

  if (errors.length > 0) return { errors }

  const base = {
    schema: CROSS_PLATFORM_SCHEMA,
    commit: input.commit,
    workflow: input.workflow,
    workflowPath: input.workflowPath,
    workflowId: input.workflowId,
    runId: input.runId,
    runAttempt: input.runAttempt,
    event: input.event,
    platforms,
  }
  const document: CrossPlatformEvidenceDocument = {
    ...base,
    digest: crossPlatformDigest(base),
  }
  return { document, errors: [] }
}

function findJob(
  jobs: readonly Record<string, unknown>[],
  requirement: JobRequirement,
): Record<string, unknown> | undefined {
  return jobs.find(job => {
    const name = String(job.name ?? '')
    if (name === requirement.name) return true
    if (!name.startsWith(`${requirement.name} (`)) return false
    if (!requirement.platformHint) return true
    return name.includes(requirement.platformHint)
  })
}

function main(): void {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', default: 'baicie/zeus' },
      'run-id': { type: 'string' },
      'run-attempt': { type: 'string' },
      commit: { type: 'string' },
      workflow: { type: 'string', default: 'CI' },
      'workflow-path': { type: 'string', default: '.github/workflows/ci.yml' },
      'workflow-id': { type: 'string' },
      event: { type: 'string' },
      out: { type: 'string', default: 'temp/cross-platform/evidence.json' },
    },
  })
  for (const key of ['run-id', 'run-attempt', 'commit', 'event'] as const) {
    if (!values[key]) throw new Error(`--${key} is required`)
  }
  const snapshot = fetchRunSnapshot({
    repository: values.repo!,
    runId: values['run-id']!,
  })
  if (!snapshot.snapshot) {
    for (const error of snapshot.errors) console.error(`BLOCKER ${error}`)
    process.exitCode = 1
    return
  }
  const result = collectCrossPlatformEvidence({
    commit: values.commit!,
    workflow: values.workflow!,
    workflowPath: values['workflow-path']!,
    workflowId:
      values['workflow-id'] ?? String(snapshot.snapshot.run.workflow_id ?? ''),
    runId: values['run-id']!,
    runAttempt: values['run-attempt']!,
    event: values.event!,
    jobs: snapshot.snapshot.jobs,
    artifacts: snapshot.snapshot.artifacts,
  })
  if (result.errors.length > 0 || !result.document) {
    for (const error of result.errors) console.error(`BLOCKER ${error}`)
    process.exitCode = 1
    return
  }
  const output = path.resolve(values.out!)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(result.document, null, 2)}\n`)
  console.log(`CROSS_PLATFORM_EVIDENCE_WRITTEN: ${output}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
