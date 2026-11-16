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
 * The governance token is the widest credential in the repository. It is
 * checked separately so that adding it to a second environment fails here
 * rather than silently widening who can read repository configuration.
 */
const governanceHolders = environmentsHoldingSecret('ZEUS_GOVERNANCE_TOKEN')
if (governanceHolders.length !== 1) {
  problems.push({
    workflow: '(contracts)',
    message: `ZEUS_GOVERNANCE_TOKEN is held by ${governanceHolders.length} environments (${governanceHolders.join(', ')}); it must exist in exactly one`,
  })
}

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
