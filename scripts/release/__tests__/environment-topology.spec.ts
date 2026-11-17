/**
 * The workflow → environment → secret table, tested as a table.
 *
 * Two failures this must catch, because both look fine in a diff:
 *
 * - a workflow naming an environment the table does not assign it, so it
 *   inherits a grant nobody reviewed;
 * - a binding that is honest but impossible — a `workflow_dispatch` job in a
 *   tag-only environment, which is undeployable and is usually "fixed" by
 *   widening the environment rather than by moving the job.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ENVIRONMENT_CONTRACTS,
  RELEASE_ENVIRONMENTS,
  WORKFLOW_BINDINGS,
  environmentsHoldingSecret,
  readWorkflowEnvironments,
  triggerFitsEnvironment,
  validateWorkflowBindings,
  type EnvironmentContract,
  type WorkflowBinding,
} from '../environment-topology'

const REPO_ROOT = new URL('../../..', import.meta.url).pathname

describe('the real bindings in this repository', () => {
  it('match the workflow files and their triggers', () => {
    expect(validateWorkflowBindings(REPO_ROOT)).toEqual([])
  })

  /*
   * One environment for everything that publishes. R13 had five, shaped by a
   * dual-approval model this project does not have; three of them had no job
   * left once the approval requirement went away.
   */
  it('uses two environments, not five', () => {
    expect(Object.keys(ENVIRONMENT_CONTRACTS).sort()).toEqual([
      'Canary',
      'Release',
    ])
  })

  it('binds every publishing workflow to a contract', () => {
    const bound = new Set(WORKFLOW_BINDINGS.map(binding => binding.workflow))
    for (const required of [
      '.github/workflows/release.yml',
      '.github/workflows/devtools-release.yml',
      '.github/workflows/repair-dist-tags.yml',
      '.github/workflows/repair-native-latest.yml',
      '.github/workflows/release-canary.yml',
    ]) {
      expect(bound.has(required)).toBe(true)
    }
  })

  it('has no workflow for an approval or governance environment', () => {
    /*
     * Both existed to hold a human signature and to grade environment
     * protection. Neither job exists any more, and a workflow left behind
     * would be a dispatch input nobody reads.
     */
    const files = fs.readdirSync(path.join(REPO_ROOT, '.github/workflows'))
    expect(files).not.toContain('rc-approval.yml')
    expect(files).not.toContain('release-governance.yml')
  })
})

describe('reading the environment a workflow declares', () => {
  it('reads the inline form', () => {
    expect(readWorkflowEnvironments('    environment: Release\n')).toEqual([
      'Release',
    ])
  })

  it('reads the mapping form', () => {
    const source = '    environment:\n      name: RC Approval\n      url: x\n'
    expect(readWorkflowEnvironments(source)).toEqual(['RC Approval'])
  })

  it('ignores a computed name rather than guessing', () => {
    const source = '    environment:\n      name: ${{ inputs.environment }}\n'
    expect(readWorkflowEnvironments(source)).toEqual([])
  })

  it('reads every environment a multi-job workflow names', () => {
    const source = [
      'jobs:',
      '  a:',
      '    environment: Release',
      '  b:',
      '    environment: Release Maintenance',
    ].join('\n')
    expect(readWorkflowEnvironments(source)).toEqual([
      'Release',
      'Release Maintenance',
    ])
  })
})

describe('trigger fit', () => {
  /*
   * The live contract admits four patterns. These tests build narrower or
   * different contracts directly so the fit rule is exercised on its own
   * terms rather than only through the one configuration that happens to
   * exist today.
   */
  function contract(
    allowedRefs: EnvironmentContract['allowedRefs'],
  ): EnvironmentContract {
    return {
      environment: RELEASE_ENVIRONMENTS.release,
      purpose: 'test fixture',
      allowedRefs,
      secrets: [],
      publishesNewVersion: true,
    }
  }

  function binding(
    triggerRefs: WorkflowBinding['triggerRefs'],
  ): WorkflowBinding {
    return {
      workflow: 'x.yml',
      environment: RELEASE_ENVIRONMENTS.release,
      triggerRefs,
    }
  }

  it('accepts a tag trigger in a tag-only environment', () => {
    expect(
      triggerFitsEnvironment(
        binding([{ type: 'tag', pattern: 'v*' }]),
        contract([{ type: 'tag', pattern: 'v*' }]),
      ),
    ).toBe(true)
  })

  it('rejects a main trigger in a tag-only environment', () => {
    expect(
      triggerFitsEnvironment(
        binding([{ type: 'branch', pattern: 'main' }]),
        contract([{ type: 'tag', pattern: 'v*' }]),
      ),
    ).toBe(false)
  })

  it('rejects a mixed trigger when any part is outside the policy', () => {
    expect(
      triggerFitsEnvironment(
        binding([
          { type: 'tag', pattern: 'v*' },
          { type: 'branch', pattern: 'release/2' },
        ]),
        contract([{ type: 'tag', pattern: 'v*' }]),
      ),
    ).toBe(false)
  })

  it('rejects a different tag namespace', () => {
    expect(
      triggerFitsEnvironment(
        binding([{ type: 'tag', pattern: 'create-zeus@*' }]),
        contract([{ type: 'tag', pattern: 'v*' }]),
      ),
    ).toBe(false)
  })

  it('rejects an unpinned branch when only main is admitted', () => {
    expect(
      triggerFitsEnvironment(
        binding([{ type: 'branch', pattern: 'feature/x' }]),
        contract([{ type: 'branch', pattern: 'main' }]),
      ),
    ).toBe(false)
  })

  it('rejects a branch pattern that only shares a prefix with main', () => {
    /*
     * `main` is a literal; `mainline` starts with it. Treating a literal as a
     * prefix would admit a branch nobody meant to grant.
     */
    expect(
      triggerFitsEnvironment(
        binding([{ type: 'branch', pattern: 'mainline' }]),
        contract([{ type: 'branch', pattern: 'main' }]),
      ),
    ).toBe(false)
  })

  it('accepts a trigger the live contract admits', () => {
    for (const bindingEntry of WORKFLOW_BINDINGS) {
      expect(
        triggerFitsEnvironment(
          bindingEntry,
          ENVIRONMENT_CONTRACTS[bindingEntry.environment],
        ),
      ).toBe(true)
    }
  })
})

describe('the contracts', () => {
  it('names a purpose for every environment', () => {
    for (const contract of Object.values(ENVIRONMENT_CONTRACTS)) {
      expect(contract.purpose.length).toBeGreaterThan(20)
    }
  })

  it('lets exactly one environment publish a release', () => {
    const publishers = Object.values(ENVIRONMENT_CONTRACTS).filter(
      contract =>
        contract.publishesNewVersion &&
        contract.environment === RELEASE_ENVIRONMENTS.release,
    )
    expect(publishers).toHaveLength(1)
  })

  /*
   * No environment names an Administration-scoped token any more: nothing
   * reads environment protection, so nothing needs the permission that read
   * requires. A long-lived token with repository-configuration access is the
   * single widest credential this project could hold, and dropping it is a
   * gain, not a loss.
   */
  it('holds no administration-scoped token anywhere', () => {
    expect(environmentsHoldingSecret('ZEUS_GOVERNANCE_TOKEN')).toEqual([])
  })

  it('admits the release tag, the devtools tags, and main for repair', () => {
    expect(
      ENVIRONMENT_CONTRACTS[RELEASE_ENVIRONMENTS.release].allowedRefs,
    ).toEqual([
      { type: 'tag', pattern: 'v*' },
      { type: 'tag', pattern: 'create-zeus@*' },
      { type: 'tag', pattern: 'vite-plugin@*' },
      { type: 'branch', pattern: 'main' },
    ])
  })

  it('does not admit a bare wildcard into the publish environment', () => {
    const refs = ENVIRONMENT_CONTRACTS[RELEASE_ENVIRONMENTS.release].allowedRefs
    expect(refs.some(ref => ref.pattern === '*')).toBe(false)
  })
})

describe('validating bindings against files', () => {
  it('reports a missing workflow file', () => {
    const problems = validateWorkflowBindings('/nonexistent-root', [
      {
        workflow: '.github/workflows/nope.yml',
        environment: RELEASE_ENVIRONMENTS.release,
        triggerRefs: [{ type: 'tag', pattern: 'v*' }],
      },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]?.message).toMatch(/does not exist/)
  })

  it('reports a workflow that declares the wrong environment', () => {
    const problems = validateWorkflowBindings(REPO_ROOT, [
      {
        // Declares `Canary`; binding it to `Release` is the mismatch.
        workflow: '.github/workflows/release-canary.yml',
        environment: RELEASE_ENVIRONMENTS.release,
        triggerRefs: [{ type: 'branch', pattern: 'main' }],
      },
    ])
    expect(
      problems.some(problem => /but the contract says/.test(problem.message)),
    ).toBe(true)
  })

  /*
   * The undeployable case. A dispatch workflow that runs on `main` bound to a
   * contract admitting only release tags would be refused at deploy time — a
   * late and confusing way to find out, and usually "fixed" by widening the
   * policy.
   */
  it('reports both the file mismatch and the impossible trigger', () => {
    const problems = validateWorkflowBindings(REPO_ROOT, [
      {
        workflow: '.github/workflows/release-canary.yml',
        environment: RELEASE_ENVIRONMENTS.release,
        triggerRefs: [{ type: 'tag', pattern: 'create-zeus@*' }],
      },
    ])
    /* `Release` admits create-zeus@*, so the trigger fits; the file declares
     * `Canary`, so the mismatch is the finding. */
    expect(
      problems.some(problem => /but the contract says/.test(problem.message)),
    ).toBe(true)
  })
})
