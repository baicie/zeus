/**
 * Every file an image build reads must be able to trigger that build.
 *
 * Both image workflows copy a fixed set of paths out of the repository and run
 * root build scripts. A trigger list that omits one of those inputs produces an
 * image from older code with no sign anything was skipped: the run never
 * starts, so there is no failed check to notice.
 *
 * The input list is derived from each Dockerfile rather than restated here, so
 * adding a `COPY` without extending the trigger fails this test instead of
 * silently shipping stale images.
 *
 * Why a text test: the repository carries no YAML parser for tests (see
 * `ci-workflow-triggers.spec.ts`). The shapes read here are the flat `paths:`
 * glob lists under each trigger and the `COPY`/`RUN` lines of a Dockerfile.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')

interface Workflow {
  readonly name: string
  readonly workflow: string
  readonly dockerfile: string
}

const WORKFLOWS: readonly Workflow[] = [
  {
    name: 'admin-image',
    workflow: readFileSync(
      path.join(root, '.github/workflows/admin-image.yml'),
      'utf8',
    ),
    dockerfile: readFileSync(
      path.join(root, 'examples/admin/Dockerfile'),
      'utf8',
    ),
  },
  {
    name: 'playground-image',
    workflow: readFileSync(
      path.join(root, '.github/workflows/playground-image.yml'),
      'utf8',
    ),
    dockerfile: readFileSync(
      path.join(root, 'examples/playground-editor/Dockerfile'),
      'utf8',
    ),
  },
]

/** The globs under `on.<event>.paths`, and nothing else. */
function triggerPaths(workflow: string, event: string): string[] {
  const lines = workflow.split('\n')
  const start = lines.findIndex(line => line.trimEnd() === `  ${event}:`)
  if (start < 0) return []
  const globs: string[] = []
  let inPaths = false
  for (const line of lines.slice(start + 1)) {
    // A sibling trigger ends this event's block.
    if (/^ {2}\S/.test(line)) break
    if (/^ {4}paths:\s*$/.test(line)) {
      inPaths = true
      continue
    }
    if (!inPaths) continue
    const match = /^ {6}- '?(.+?)'?$/.exec(line)
    if (match) {
      globs.push(match[1] as string)
      continue
    }
    // A comment keeps us inside `paths:`; any other content ends it.
    if (line.trim() !== '' && !line.trim().startsWith('#')) inPaths = false
  }
  return globs
}

/**
 * The repository paths a Dockerfile copies in, plus the scripts it runs.
 *
 * `COPY a b c ./` lists inputs; `COPY --from=…` hands off an internal stage and
 * names no repository path. `RUN node … scripts/x.ts` names a script whose
 * contents change the output.
 */
function dockerfileInputs(dockerfile: string): string[] {
  const inputs = new Set<string>()
  for (const raw of dockerfile.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    if (!line.startsWith('COPY ')) {
      for (const match of line.matchAll(/scripts\/[\w./-]+\.(?:ts|mjs)/g)) {
        inputs.add(match[0])
      }
      continue
    }
    // `COPY --chown=… --from=build /app/x ./y` reads a build stage, not the
    // repository, however its flags are ordered.
    if (/^COPY\s+(?:--\S+\s+)*--from=/.test(line)) continue
    const parts = line
      .replace(/^COPY\s+/, '')
      .split(/\s+/)
      .filter(token => !token.startsWith('--'))
    // The last token is the destination; the rest are inputs.
    for (const token of parts.slice(0, -1)) {
      const relative = token.replace(/^\.\//, '').replace(/\/+$/, '')
      if (relative === '' || relative === '.') continue
      inputs.add(relative)
    }
  }
  return [...inputs].sort()
}

/** Whether a repository path is covered by at least one trigger glob. */
function coveredBy(globs: readonly string[], file: string): boolean {
  return globs.some(glob => {
    if (glob === file) return true
    if (glob.endsWith('/**')) {
      const prefix = glob.slice(0, -3)
      // `packages/**` covers the directory `packages` and everything under it.
      return file === prefix || file.startsWith(`${prefix}/`)
    }
    if (glob.endsWith('/*')) {
      const prefix = glob.slice(0, -2)
      return (
        file.startsWith(`${prefix}/`) &&
        !file.slice(prefix.length + 1).includes('/')
      )
    }
    return false
  })
}

describe.each(WORKFLOWS)('$name triggers cover the build inputs', entry => {
  it('covers every path the Dockerfile copies or executes', () => {
    const push = triggerPaths(entry.workflow, 'push')
    expect(push.length, 'push trigger must list paths').toBeGreaterThan(0)
    const missing = dockerfileInputs(entry.dockerfile).filter(
      input => !coveredBy(push, input),
    )
    expect(
      missing,
      `${entry.name}: these Dockerfile inputs do not trigger the build: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('mirrors the push inputs on pull_request', () => {
    const push = triggerPaths(entry.workflow, 'push')
    const pullRequest = triggerPaths(entry.workflow, 'pull_request')
    expect(
      pullRequest.length,
      `${entry.name}: a PR must build the image it changes`,
    ).toBeGreaterThan(0)
    // Every input a push watches is also one a PR must validate. A PR that
    // changes the Dockerfile's inputs without building the image defers the
    // first real build to main and to production.
    const missing = dockerfileInputs(entry.dockerfile).filter(
      input => !coveredBy(pullRequest, input),
    )
    expect(
      missing,
      `${entry.name}: pull_request does not build for: ${missing.join(', ')}`,
    ).toEqual([])
    expect(
      push.every(glob => pullRequest.includes(glob)),
      `${entry.name}: pull_request paths must include every push path`,
    ).toBe(true)
  })

  it('triggers on .dockerignore, which decides the build context', () => {
    const push = triggerPaths(entry.workflow, 'push')
    expect(coveredBy(push, '.dockerignore')).toBe(true)
  })
})

describe('admin-image deploys only from main', () => {
  const workflow = WORKFLOWS[0]?.workflow ?? ''

  it('computes should_deploy from ref and event, not from a manual flag alone', () => {
    expect(workflow).toMatch(
      /if \[\[ "\$\{GITHUB_REF\}" == "refs\/heads\/main" && "\$\{GITHUB_EVENT_NAME\}" == "push" \]\]/,
    )
  })

  it('gates the deploy job on should_deploy', () => {
    const deployJob = workflow.slice(workflow.indexOf('\n  deploy:'))
    expect(deployJob, 'a deploy job must exist').not.toBe('')
    expect(deployJob).toMatch(/needs\.build\.outputs\.should_deploy == 'true'/)
  })
})
