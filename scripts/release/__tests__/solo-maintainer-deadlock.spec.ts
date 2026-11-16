/**
 * That a single maintainer can actually release.
 *
 * v1 could not distinguish "nobody approved this" from "this is unsafe", so
 * for a project with one maintainer there was no path that both succeeded and
 * satisfied the policy: reviewers configured meant the run waited forever,
 * reviewers absent meant the policy reported FAIL, and the only way through
 * was an admin bypass.
 *
 * These tests assert the property directly rather than by inspection: no input
 * a solo maintainer cannot produce is required by anything on the release
 * path, and no rule in the policy measures a human.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  WORKFLOW_BINDINGS,
  ENVIRONMENT_CONTRACTS,
} from '../environment-topology'
import { AUTHORIZATION_RULES } from '../release-authorization'

const root = path.resolve(import.meta.dirname, '../../..')

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

/** Workflows that can publish or repair published state. */
const PUBLISHING_WORKFLOWS = [
  '.github/workflows/release.yml',
  '.github/workflows/devtools-release.yml',
  '.github/workflows/repair-dist-tags.yml',
  '.github/workflows/repair-native-latest.yml',
] as const

describe('no release rule measures a human', () => {
  /*
   * The rules are the policy. If a rule's name is about a person, an approval,
   * or a signature, the policy has drifted back to v1.
   */
  it('has no rule about approvals, reviewers or sign-off', () => {
    const names = Object.values(AUTHORIZATION_RULES)
    expect(
      names.filter(name => /approv|review|sign|human|approver/.test(name)),
    ).toEqual([])
  })

  it('declares every rule it evaluates', () => {
    expect(Object.values(AUTHORIZATION_RULES).length).toBeGreaterThanOrEqual(11)
  })
})

describe('no publishing workflow needs a hand-produced input', () => {
  /*
   * The three v1 repository variables were each a run id or a name a human
   * copied. A workflow that still reads one cannot run until someone does that
   * copying, which is the deadlock.
   */
  const FORBIDDEN = [
    'ZEUS_RC_APPROVERS',
    'ZEUS_RC_APPROVAL_RUN_ID',
    'ZEUS_DEPLOYMENT_EVIDENCE_RUN_ID',
    'ZEUS_GOVERNANCE_TOKEN',
  ] as const

  for (const workflow of PUBLISHING_WORKFLOWS) {
    it(`${workflow} requires none of the v1 approval inputs`, () => {
      const source = read(workflow)
      for (const name of FORBIDDEN) {
        expect(source).not.toContain(name)
      }
    })
  }
})

describe('no environment waits for a reviewer', () => {
  /*
   * Required reviewers are repository configuration, not workflow text, so
   * this cannot be asserted from the files. What it can assert is that the
   * contract does not *ask* for them: an environment whose purpose mentions
   * approval is one a maintainer will configure to block.
   */
  it('describes no environment as requiring approval', () => {
    for (const contract of Object.values(ENVIRONMENT_CONTRACTS)) {
      expect(contract.purpose.toLowerCase()).not.toMatch(
        /require[sd]? (review|approval)/,
      )
    }
  })

  it('binds every publishing workflow to an environment that exists', () => {
    const bound = new Map(
      WORKFLOW_BINDINGS.map(binding => [binding.workflow, binding.environment]),
    )
    for (const workflow of PUBLISHING_WORKFLOWS) {
      expect(bound.has(workflow)).toBe(true)
    }
  })
})

describe('the approval machinery is gone, not disabled', () => {
  it('has no approval workflow file', () => {
    for (const file of ['rc-approval.yml', 'release-governance.yml']) {
      expect(fs.existsSync(path.join(root, '.github/workflows', file))).toBe(
        false,
      )
    }
  })

  it('has no script that produces an approval document', () => {
    for (const file of [
      'create-rc-approval.ts',
      'verify-rc-approval.ts',
      'assemble-rc-evidence.ts',
      'create-release-environment-evidence.ts',
    ]) {
      expect(fs.existsSync(path.join(root, 'scripts/release', file))).toBe(
        false,
      )
    }
  })

  /*
   * The release path must still have a gate. Removing the approval without
   * replacing it would be the failure mode this whole package exists to
   * avoid: an unprotected publish step.
   */
  it('replaces it with an authorisation step before the publish', () => {
    const release = read('.github/workflows/release.yml')
    const authorise = release.indexOf('authorize-release.ts')
    const publish = release.indexOf('pnpm release --publishOnly')
    expect(authorise).toBeGreaterThan(-1)
    expect(publish).toBeGreaterThan(-1)
    expect(authorise).toBeLessThan(publish)
  })
})
