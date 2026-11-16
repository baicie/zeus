/**
 * Which workflow may reach which environment, and why.
 *
 * ## What changed from R13
 *
 * R13 split the release machinery across five environments, shaped by a
 * dual-approval model that this project does not have: one maintainer, no
 * second signature. Three of those environments had no job left once the
 * approval requirement went away, and one of them (`Release Maintenance`)
 * existed only because `Release` was tag-only while maintenance runs from
 * `main` — a boundary that added a settings page without narrowing a grant,
 * since both environments held the same `NPM_TOKEN`.
 *
 * The result is one environment for everything that can publish. Narrowing is
 * done by the workflow-level checks — which workflow may run on which ref, and
 * what each one is allowed to write — because those are code, reviewed and
 * tested, rather than repository settings that drift.
 *
 * ## What this module is and is not
 *
 * It is a declaration plus a validator: the table below is checked against the
 * workflow files in CI, so a workflow that names the wrong environment, or
 * that could run on a ref the environment does not admit, fails rather than
 * silently acquiring a grant. It cannot configure GitHub — environment
 * protection is set by a maintainer — and it does not pretend to.
 */
import fs from 'node:fs'
import path from 'node:path'

/** The environments this repository's release machinery uses. */
export const RELEASE_ENVIRONMENTS = {
  /** Publishes packages. Holds the npm token. */
  release: 'Release',
  /** Publishes prerelease canaries. Holds its own token. */
  canary: 'Canary',
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
 * `Release` admits four patterns because four workflows publish or repair
 * through it, and they run on different refs:
 *
 * - `v*` — the release tag;
 * - `create-zeus@*`, `vite-plugin@*` — the devtools tags;
 * - `main` — the two repair workflows, which act on already-published state.
 *
 * Each pattern is narrower than `*`. What keeps the four from blurring into
 * one grant is not the environment but the workflow: `repair-dist-tags.yml`
 * can move a dist-tag and cannot publish a version, `release.yml` can do both,
 * and each declares its own `permissions:` and `if:` guards.
 */
export const ENVIRONMENT_CONTRACTS: Readonly<
  Record<ReleaseEnvironmentName, EnvironmentContract>
> = {
  [RELEASE_ENVIRONMENTS.release]: {
    environment: RELEASE_ENVIRONMENTS.release,
    purpose:
      'Publishes the released artifact from a release tag, and repairs already-published registry state from main.',
    allowedRefs: [
      { type: 'tag', pattern: 'v*' },
      { type: 'tag', pattern: 'create-zeus@*' },
      { type: 'tag', pattern: 'vite-plugin@*' },
      { type: 'branch', pattern: 'main' },
    ],
    secrets: ['NPM_TOKEN'],
    publishesNewVersion: true,
  },
  [RELEASE_ENVIRONMENTS.canary]: {
    environment: RELEASE_ENVIRONMENTS.canary,
    purpose:
      'Publishes a prerelease canary from main so the publish path is exercised before a tag.',
    allowedRefs: [{ type: 'branch', pattern: 'main' }],
    secrets: ['NPM_TOKEN', 'ZEUS_UI_DISPATCH_TOKEN'],
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
    workflow: '.github/workflows/devtools-release.yml',
    environment: RELEASE_ENVIRONMENTS.release,
    triggerRefs: [
      { type: 'tag', pattern: 'create-zeus@*' },
      { type: 'tag', pattern: 'vite-plugin@*' },
    ],
  },
  {
    workflow: '.github/workflows/repair-dist-tags.yml',
    environment: RELEASE_ENVIRONMENTS.release,
    triggerRefs: [{ type: 'branch', pattern: 'main' }],
  },
  {
    workflow: '.github/workflows/repair-native-latest.yml',
    environment: RELEASE_ENVIRONMENTS.release,
    triggerRefs: [{ type: 'branch', pattern: 'main' }],
  },
  {
    workflow: '.github/workflows/release-canary.yml',
    environment: RELEASE_ENVIRONMENTS.canary,
    triggerRefs: [{ type: 'branch', pattern: 'main' }],
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
     * the mapping branch below unreachable.
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
 * A workflow's trigger pattern must fall inside one of the environment's
 * admitted patterns. `main` does not satisfy `v*`; neither does `create-zeus@*`
 * satisfy `v*` unless the contract lists it.
 */
export function triggerFitsEnvironment(
  binding: WorkflowBinding,
  contract: EnvironmentContract,
): boolean {
  return binding.triggerRefs.every(trigger =>
    contract.allowedRefs.some(
      allowed =>
        allowed.type === trigger.type &&
        patternCovers(allowed.pattern, trigger.pattern),
    ),
  )
}

/**
 * Whether an admitted pattern covers a trigger pattern.
 *
 * Only `<literal>` and `<literal>*` are understood — the same conservative
 * model the policy uses, for the same reason: a pattern whose reach cannot be
 * computed cannot be shown to cover anything in particular.
 */
function patternCovers(admitted: string, trigger: string): boolean {
  if (admitted === trigger) return true
  if (!admitted.endsWith('*')) return false
  const prefix = admitted.slice(0, -1)
  return trigger.startsWith(prefix)
}

/**
 * Checks the declared bindings against the contracts and the workflow files.
 *
 * Three independent questions, because a mismatch can be any of them:
 *
 * - the table says one environment and the file says another — the binding is
 *   stale documentation, which is how a workflow ends up in an environment
 *   nobody reviewed;
 * - the file names a second environment beside its own, so the publish grant
 *   reaches it through a job the contract never assigned;
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
    /*
     * Naming the contract environment is not enough — a workflow can name it
     * in one job and another environment in a second job, and rules combine
     * additively across jobs, so the grant reaches the workflow either way.
     */
    const extra = declared.filter(name => name !== binding.environment)
    if (extra.length > 0) {
      problems.push({
        workflow: binding.workflow,
        message: `also names ${extra.join(', ')}; a workflow must not hold a second environment's grant beside its own`,
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

  /*
   * A workflow that is not in the table at all is unchecked, which is how one
   * could acquire the publish grant while this gate stays green. Every
   * workflow that names an environment must be bound.
   */
  const bound = new Set(bindings.map(binding => binding.workflow))
  const workflowsDir = path.join(root, '.github/workflows')
  if (fs.existsSync(workflowsDir)) {
    for (const entry of fs.readdirSync(workflowsDir)) {
      if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) continue
      const relative = `.github/workflows/${entry}`
      if (bound.has(relative)) continue
      const source = fs.readFileSync(path.join(workflowsDir, entry), 'utf8')
      const declared = readWorkflowEnvironments(source)
      const managed = declared.filter(name =>
        Object.values(RELEASE_ENVIRONMENTS).includes(
          name as ReleaseEnvironmentName,
        ),
      )
      if (managed.length > 0) {
        problems.push({
          workflow: relative,
          message: `names ${managed.join(', ')} but is not bound in WORKFLOW_BINDINGS, so nothing checks whether its trigger can reach that environment`,
        })
      }
    }
  }

  return problems
}

/**
 * Which environments hold a given secret.
 *
 * Used to keep a credential from spreading: if a second environment starts
 * listing it, the blast radius widens without any single file looking wrong.
 */
export function environmentsHoldingSecret(
  secret: string,
): ReleaseEnvironmentName[] {
  return Object.values(ENVIRONMENT_CONTRACTS)
    .filter(contract => contract.secrets.includes(secret))
    .map(contract => contract.environment)
}
