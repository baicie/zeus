/**
 * Which workflow may reach which environment, and why.
 *
 * ## The conflict this resolves
 *
 * R11 concluded the `Release` environment should admit only `refs/tags/v*`.
 * That is right for the job that publishes npm and wrong for everything else
 * that currently names the same environment, because those workflows do not
 * run on a release tag at all:
 *
 * | workflow              | trigger                                  |
 * | --------------------- | ---------------------------------------- |
 * | `release.yml`         | `push` on `v*` tags                      |
 * | `rc-approval.yml`     | `workflow_dispatch` (ref = main)         |
 * | `release-governance.yml` | `workflow_dispatch` (ref = main)      |
 * | `repair-dist-tags.yml`   | `workflow_dispatch` (ref = main)      |
 * | `repair-native-latest.yml` | `workflow_dispatch`, **and it asserts `github.ref == 'refs/heads/main'`** |
 * | `devtools-release.yml` | `push` on `create-zeus@*`, `vite-plugin@*` |
 *
 * A `workflow_dispatch` run's `GITHUB_REF` is the branch the workflow file was
 * dispatched from, which is `refs/heads/main`. The deployment branch policy
 * compares that ref, not the SHA the job checks out. So a tag-only `Release`
 * environment makes five of those six workflows undeployable — and
 * `repair-native-latest` cannot even be re-pointed at a tag without deleting
 * the guard that keeps it on main.
 *
 * Widening `Release` to admit `main` would then let a release be deployed from
 * an untagged commit, which is the thing the tag-only rule exists to stop.
 *
 * ## The split
 *
 * The environments are separated by **what the job is allowed to change**, not
 * by which workflow file it lives in:
 *
 * - `Release` — writes the published artifact. Tags only. Holds `NPM_TOKEN`.
 * - `RC Approval` — records that a human approved a specific candidate. Must
 *   be dispatchable from `main` because that is where the approval document
 *   is reviewed, but it publishes nothing and holds no publish credential.
 * - `Release Governance` — reads the environment configuration to produce the
 *   evidence record. Holds the Administration-scoped token, publishes
 *   nothing, and is the only holder of that token.
 * - `Release Maintenance` — repairs already-published registry state
 *   (dist-tags, a polluted `latest`). Writes to npm, but only to move tags on
 *   versions that already exist; it never publishes a new version.
 * - `Devtools Release` — publishes `create-zeus` and `vite-plugin`, separate
 *   packages with their own tag namespace and their own token.
 *
 * A job that publishes a release is in `Release`. A job that cannot publish a
 * release is not, whatever else it does.
 *
 * ## What this module is and is not
 *
 * It is a declaration plus a validator: the table below is checked against the
 * workflow files in CI, so a workflow that names the wrong environment fails
 * rather than silently inheriting a broader grant. It cannot configure
 * GitHub — environment protection is set by a maintainer — and it does not
 * pretend to.
 */
import fs from 'node:fs'
import path from 'node:path'

/** The environments this repository's release machinery uses. */
export const RELEASE_ENVIRONMENTS = {
  /** Publishes the released artifact. Tags only. Holds the npm publish token. */
  release: 'Release',
  /** Records a human approval for a candidate. Publishes nothing. */
  approval: 'RC Approval',
  /** Reads environment configuration. The only holder of the admin token. */
  governance: 'Release Governance',
  /** Repairs already-published registry state. Publishes no new version. */
  maintenance: 'Release Maintenance',
  /** Publishes the devtools packages under their own tag namespace. */
  devtools: 'Devtools Release',
} as const

export type ReleaseEnvironmentName =
  (typeof RELEASE_ENVIRONMENTS)[keyof typeof RELEASE_ENVIRONMENTS]

/**
 * What a job may do, from which ref.
 *
 * `allowedRefs` are environment-side patterns — the vocabulary GitHub's
 * deployment branch policy uses — plus the `type` each lives in. A workflow
 * whose trigger cannot produce a matching ref is misconfigured, and the
 * validator says so.
 */
export interface EnvironmentContract {
  readonly environment: ReleaseEnvironmentName
  /** Why this environment exists, in one sentence. */
  readonly purpose: string
  /** The ref patterns that may deploy into it. */
  readonly allowedRefs: readonly {
    readonly type: 'branch' | 'tag'
    readonly pattern: string
  }[]
  /** Environment secrets this environment may hold. */
  readonly secrets: readonly string[]
  /** Whether a job in this environment can cause a new version to be published. */
  readonly publishesNewVersion: boolean
}

/**
 * The contract per environment.
 *
 * `secrets` is the part that keeps the blast radius small: the
 * Administration-scoped token exists in exactly one environment, so a job that
 * does not need it cannot reach it even if its workflow is compromised.
 */
export const ENVIRONMENT_CONTRACTS: Readonly<
  Record<ReleaseEnvironmentName, EnvironmentContract>
> = {
  [RELEASE_ENVIRONMENTS.release]: {
    environment: RELEASE_ENVIRONMENTS.release,
    purpose:
      'Publishes the released artifact from a release tag, after the required reviewers approve.',
    allowedRefs: [{ type: 'tag', pattern: 'v*' }],
    secrets: ['NPM_TOKEN'],
    publishesNewVersion: true,
  },
  [RELEASE_ENVIRONMENTS.approval]: {
    environment: RELEASE_ENVIRONMENTS.approval,
    purpose:
      'Records that a named human approved a specific Core/UI candidate. Publishes nothing.',
    // Dispatched from main; the approval binds a SHA, not the branch.
    allowedRefs: [{ type: 'branch', pattern: 'main' }],
    secrets: [],
    publishesNewVersion: false,
  },
  [RELEASE_ENVIRONMENTS.governance]: {
    environment: RELEASE_ENVIRONMENTS.governance,
    purpose:
      'Reads the Release environment configuration to produce signed evidence. Holds the only Administration-scoped token.',
    allowedRefs: [{ type: 'branch', pattern: 'main' }],
    secrets: ['ZEUS_GOVERNANCE_TOKEN'],
    publishesNewVersion: false,
  },
  [RELEASE_ENVIRONMENTS.maintenance]: {
    environment: RELEASE_ENVIRONMENTS.maintenance,
    purpose:
      'Moves dist-tags on versions that already exist. Cannot publish a new version.',
    // `repair-native-latest` asserts `github.ref == 'refs/heads/main'`, so this
    // environment must admit main or that workflow becomes undeployable.
    allowedRefs: [{ type: 'branch', pattern: 'main' }],
    secrets: ['NPM_TOKEN'],
    publishesNewVersion: false,
  },
  [RELEASE_ENVIRONMENTS.devtools]: {
    environment: RELEASE_ENVIRONMENTS.devtools,
    purpose:
      'Publishes create-zeus and vite-plugin from their own tag namespaces.',
    allowedRefs: [
      { type: 'tag', pattern: 'create-zeus@*' },
      { type: 'tag', pattern: 'vite-plugin@*' },
    ],
    secrets: ['NPM_TOKEN'],
    publishesNewVersion: true,
  },
}

/** The environment a given workflow file must declare, and why. */
export interface WorkflowBinding {
  readonly workflow: string
  readonly environment: ReleaseEnvironmentName
  /** The refs this workflow can actually run on, from its own trigger block. */
  readonly triggerRefs: readonly {
    readonly type: 'branch' | 'tag'
    readonly pattern: string
  }[]
}

/**
 * The bindings, as this repository's workflows are written today.
 *
 * `triggerRefs` mirrors each file's `on:` block. Where a job adds its own ref
 * guard (`repair-native-latest` asserts `refs/heads/main`), that guard is the
 * binding and is recorded rather than the dispatch default.
 */
export const WORKFLOW_BINDINGS: readonly WorkflowBinding[] = [
  {
    workflow: '.github/workflows/release.yml',
    environment: RELEASE_ENVIRONMENTS.release,
    triggerRefs: [{ type: 'tag', pattern: 'v*' }],
  },
  {
    workflow: '.github/workflows/rc-approval.yml',
    environment: RELEASE_ENVIRONMENTS.approval,
    triggerRefs: [{ type: 'branch', pattern: 'main' }],
  },
  {
    workflow: '.github/workflows/release-governance.yml',
    environment: RELEASE_ENVIRONMENTS.governance,
    triggerRefs: [{ type: 'branch', pattern: 'main' }],
  },
  {
    workflow: '.github/workflows/repair-dist-tags.yml',
    environment: RELEASE_ENVIRONMENTS.maintenance,
    triggerRefs: [{ type: 'branch', pattern: 'main' }],
  },
  {
    workflow: '.github/workflows/repair-native-latest.yml',
    environment: RELEASE_ENVIRONMENTS.maintenance,
    triggerRefs: [{ type: 'branch', pattern: 'main' }],
  },
  {
    workflow: '.github/workflows/devtools-release.yml',
    environment: RELEASE_ENVIRONMENTS.devtools,
    triggerRefs: [
      { type: 'tag', pattern: 'create-zeus@*' },
      { type: 'tag', pattern: 'vite-plugin@*' },
    ],
  },
]

export interface WorkflowProblem {
  readonly workflow: string
  readonly message: string
}

/**
 * Reads the `environment:` a workflow job declares.
 *
 * Both spellings occur: `environment: Release` and a three-line mapping.
 * Returns every environment named in the file, since a workflow with several
 * jobs may legitimately use more than one.
 */
export function readWorkflowEnvironments(source: string): string[] {
  const names = new Set<string>()
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string
    /*
     * `environment:` alone (the mapping form) must be matched separately: a
     * regex requiring `(.+?)` after the colon skips it entirely, which made
     * the mapping branch below unreachable and the reader silently return
     * nothing for a perfectly valid workflow.
     */
    if (/^\s*environment:\s*$/.test(line)) {
      const next = lines[index + 1]
      const mapped = next ? /^\s+name:\s*(.+?)\s*$/.exec(next) : null
      if (mapped) {
        const mappedValue = (mapped[1] as string).replace(/^['"]|['"]$/g, '')
        /*
         * A computed name cannot be checked statically, which is a problem the
         * caller reports rather than one this reader guesses around.
         */
        if (!mappedValue.startsWith('${{')) names.add(mappedValue)
      }
      continue
    }
    const inline = /^\s*environment:\s*(.+?)\s*$/.exec(line)
    if (!inline) continue
    const value = (inline[1] as string).replace(/^['"]|['"]$/g, '')
    if (value.startsWith('#') || value.startsWith('${{')) continue
    names.add(value)
  }
  return [...names]
}

/**
 * Whether a trigger's refs could ever satisfy an environment's policy.
 *
 * `workflow_dispatch` reads as `refs/heads/main` in the table above; a
 * dispatch that names a tag ref would not match, and GitHub has no dispatch
 * input that changes `GITHUB_REF`.
 */
export function triggerFitsEnvironment(
  binding: WorkflowBinding,
  contract: EnvironmentContract,
): boolean {
  return binding.triggerRefs.every(trigger =>
    contract.allowedRefs.some(
      allowed =>
        allowed.type === trigger.type && allowed.pattern === trigger.pattern,
    ),
  )
}

/**
 * Checks the declared bindings against the contracts and the workflow files.
 *
 * Two independent questions, because a mismatch can be either:
 *
 * - the table says one environment and the file says another — the binding is
 *   stale documentation, which is how a workflow ends up in an environment
 *   nobody reviewed;
 * - the binding is honest but the trigger cannot satisfy the environment's
 *   policy — the workflow would be undeployable, which reads as "protection
 *   works" right up until someone widens the policy to unbreak it.
 */
export function validateWorkflowBindings(
  root: string,
  bindings: readonly WorkflowBinding[] = WORKFLOW_BINDINGS,
): readonly WorkflowProblem[] {
  const problems: WorkflowProblem[] = []
  for (const binding of bindings) {
    const absolute = path.join(root, binding.workflow)
    if (!fs.existsSync(absolute)) {
      problems.push({
        workflow: binding.workflow,
        message: 'the workflow file does not exist',
      })
      continue
    }
    const source = fs.readFileSync(absolute, 'utf8')
    const declared = readWorkflowEnvironments(source)
    if (declared.length === 0) {
      problems.push({
        workflow: binding.workflow,
        message:
          'the workflow declares no environment, so its jobs run with the repository defaults rather than an approved grant',
      })
      continue
    }
    if (!declared.includes(binding.environment)) {
      problems.push({
        workflow: binding.workflow,
        message: `declares ${declared.join(', ')} but the contract says ${binding.environment}`,
      })
    }
    const contract = ENVIRONMENT_CONTRACTS[binding.environment]
    if (!triggerFitsEnvironment(binding, contract)) {
      problems.push({
        workflow: binding.workflow,
        message: `runs on ${binding.triggerRefs.map(ref => `${ref.type}:${ref.pattern}`).join(', ')}, which ${binding.environment} does not admit (${contract.allowedRefs.map(ref => `${ref.type}:${ref.pattern}`).join(', ')})`,
      })
    }
  }
  return problems
}

/**
 * Which environments hold a given secret.
 *
 * Used to keep the Administration-scoped token in one place: if a second
 * environment starts listing it, the blast radius of that credential widens
 * without any single file looking wrong.
 */
export function environmentsHoldingSecret(
  secret: string,
): ReleaseEnvironmentName[] {
  return Object.values(ENVIRONMENT_CONTRACTS)
    .filter(contract => contract.secrets.includes(secret))
    .map(contract => contract.environment)
}
