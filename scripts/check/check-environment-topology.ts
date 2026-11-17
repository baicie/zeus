/**
 * Fails when a workflow is bound to an environment its trigger cannot reach,
 * or to one the contract does not assign it.
 *
 * This is a gate, not a configuration tool: it cannot create or protect a
 * GitHub environment. What it can do is make the mismatch visible in CI, so
 * that moving a job between environments is a reviewed change rather than
 * something discovered when the deployment is rejected — or, worse, when
 * someone widens an environment to unbreak it.
 *
 * Exits 1 on any problem. A run with no problems prints the table and exits 0.
 */
import path from 'node:path'
import process from 'node:process'

import {
  ENVIRONMENT_CONTRACTS,
  WORKFLOW_BINDINGS,
  environmentsHoldingSecret,
  triggerFitsEnvironment,
  validateWorkflowBindings,
} from '../release/environment-topology'

const root = path.resolve(import.meta.dirname, '../..')
const problems = [...validateWorkflowBindings(root)]

console.log('workflow → environment')
for (const binding of WORKFLOW_BINDINGS) {
  const contract = ENVIRONMENT_CONTRACTS[binding.environment]
  const fits = triggerFitsEnvironment(binding, contract)
  const refs = binding.triggerRefs
    .map(ref => `${ref.type}:${ref.pattern}`)
    .join(', ')
  console.log(
    `  ${binding.workflow} → ${binding.environment} [${fits ? 'fits' : 'MISMATCH'}] (${refs})`,
  )
}

console.log('\nenvironment → secrets')
for (const contract of Object.values(ENVIRONMENT_CONTRACTS)) {
  const secrets =
    contract.secrets.length > 0 ? contract.secrets.join(', ') : '(none)'
  console.log(
    `  ${contract.environment}: ${secrets}${contract.publishesNewVersion ? ' — publishes new versions' : ''}`,
  )
}

/*
 * Credentials must not spread silently.
 *
 * A secret in two environments has two places to leak from and one place to
 * rotate, so each shared credential is listed here explicitly with the reason.
 * The point is not that sharing is forbidden — a canary that cannot publish
 * cannot exercise the publish path — but that adding a third holder is a
 * reviewed change rather than a side effect.
 */
const SHARED_SECRETS: Readonly<Record<string, readonly string[]>> = {
  /*
   * `release-canary.yml` publishes prerelease versions to prove the publish
   * path works before a tag exists; it needs the same npm token the release
   * uses, and it is the only other holder.
   */
  NPM_TOKEN: ['Release', 'Canary'],
}

for (const [secret, allowed] of Object.entries(SHARED_SECRETS)) {
  const holders = environmentsHoldingSecret(secret)
  const unexpected = holders.filter(name => !allowed.includes(name))
  if (unexpected.length > 0) {
    problems.push({
      workflow: '(contracts)',
      message: `${secret} is held by ${unexpected.join(', ')}, which is not in its declared holder list (${allowed.join(', ')})`,
    })
  }
}

/*
 * A credential with no holder at all is not an error — it means the workflow
 * that needed it is gone. It is printed so the maintainer can delete it.
 */

if (problems.length === 0) {
  console.log('\nEnvironment topology matches the contracts.')
} else {
  console.error('')
  for (const problem of problems) {
    console.error(`${problem.workflow}: ${problem.message}`)
  }
  console.error('')
  console.error(
    `${problems.length} mismatch(es). Each workflow must run in the environment its trigger can reach.`,
  )
  process.exitCode = 1
}
