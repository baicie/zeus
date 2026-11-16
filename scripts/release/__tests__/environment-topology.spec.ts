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

  it('leaves release.yml as the only workflow in the publish grant', () => {
    const publishing = WORKFLOW_BINDINGS.filter(
      binding =>
        ENVIRONMENT_CONTRACTS[binding.environment].publishesNewVersion &&
        binding.environment === RELEASE_ENVIRONMENTS.release,
    )
    expect(publishing.map(binding => binding.workflow)).toEqual([
      '.github/workflows/release.yml',
    ])
  })

  it('binds every Release-environment workflow to a contract', () => {
    const bound = new Set(WORKFLOW_BINDINGS.map(binding => binding.workflow))
    for (const required of [
      '.github/workflows/release.yml',
      '.github/workflows/rc-approval.yml',
      '.github/workflows/release-governance.yml',
      '.github/workflows/repair-dist-tags.yml',
      '.github/workflows/repair-native-latest.yml',
      '.github/workflows/devtools-release.yml',
    ]) {
      expect(bound.has(required)).toBe(true)
    }
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
  const tagOnly: EnvironmentContract = {
    ...ENVIRONMENT_CONTRACTS[RELEASE_ENVIRONMENTS.release],
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
        tagOnly,
      ),
    ).toBe(true)
  })

  it('rejects a main trigger in a tag-only environment', () => {
    expect(
      triggerFitsEnvironment(
        binding([{ type: 'branch', pattern: 'main' }]),
        tagOnly,
      ),
    ).toBe(false)
  })

  it('rejects a mixed trigger when any part is outside the policy', () => {
    expect(
      triggerFitsEnvironment(
        binding([
          { type: 'tag', pattern: 'v*' },
          { type: 'branch', pattern: 'main' },
        ]),
        tagOnly,
      ),
    ).toBe(false)
  })

  it('rejects a different tag namespace', () => {
    expect(
      triggerFitsEnvironment(
        binding([{ type: 'tag', pattern: 'create-zeus@*' }]),
        tagOnly,
      ),
    ).toBe(false)
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

  it('keeps new-version publishing out of the maintenance environment', () => {
    expect(
      ENVIRONMENT_CONTRACTS[RELEASE_ENVIRONMENTS.maintenance]
        .publishesNewVersion,
    ).toBe(false)
  })

  /*
   * The reason the environments were split: the Administration-scoped token
   * must exist in one place, so a job that does not need repository
   * configuration cannot reach it.
   */
  it('keeps the administration token in exactly one environment', () => {
    expect(environmentsHoldingSecret('ZEUS_GOVERNANCE_TOKEN')).toEqual([
      RELEASE_ENVIRONMENTS.governance,
    ])
  })

  it('keeps the npm publish token out of the governance environment', () => {
    expect(
      ENVIRONMENT_CONTRACTS[RELEASE_ENVIRONMENTS.governance].secrets,
    ).not.toContain('NPM_TOKEN')
  })

  it('keeps the approval environment free of every secret', () => {
    expect(
      ENVIRONMENT_CONTRACTS[RELEASE_ENVIRONMENTS.approval].secrets,
    ).toEqual([])
  })

  it('admits only release tags into the release environment', () => {
    expect(
      ENVIRONMENT_CONTRACTS[RELEASE_ENVIRONMENTS.release].allowedRefs,
    ).toEqual([{ type: 'tag', pattern: 'v*' }])
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
        // Now declares `RC Approval`; binding it to `Release` is the mismatch.
        workflow: '.github/workflows/rc-approval.yml',
        environment: RELEASE_ENVIRONMENTS.release,
        triggerRefs: [{ type: 'branch', pattern: 'main' }],
      },
    ])
    expect(
      problems.some(problem => /but the contract says/.test(problem.message)),
    ).toBe(true)
  })

  /*
   * The undeployable case. `RC Approval` admits main; binding its workflow to
   * the tag-only `Release` environment would leave the job unable to deploy,
   * which is normally "fixed" by widening the environment. Both the file
   * mismatch and the trigger mismatch are reported, so the reason is visible.
   */
  it('reports both the file mismatch and the impossible trigger', () => {
    const problems = validateWorkflowBindings(REPO_ROOT, [
      {
        workflow: '.github/workflows/rc-approval.yml',
        environment: RELEASE_ENVIRONMENTS.release,
        triggerRefs: [{ type: 'branch', pattern: 'main' }],
      },
    ])
    expect(
      problems.some(problem =>
        /does not admit \(tag:v\*\)/.test(problem.message),
      ),
    ).toBe(true)
  })
})
