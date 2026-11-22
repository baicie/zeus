/**
 * The five outcomes of the native install check, and the rule that maps a
 * failure at each stage to one of them (R23 TASK 09).
 *
 * Extracted from `check-native-install.ts` so the mapping can be tested without
 * a registry, an npm, or a browser-free machine — the end-to-end script is slow
 * and network-bound, and the rule is what has to be right.
 *
 * ## Why four failures rather than one
 *
 * They have four different fixes, and rc.3 needs two of them at once: four
 * platforms are `REGISTRY_MISSING` because the publish stopped, and a consumer
 * on npm 10 gets `NOT_INSTALLED` for a platform that is published. R22 reported
 * both as "cannot find native binding" and fixed neither.
 */

export type NativeStatus =
  | 'PASS'
  | 'REGISTRY_MISSING'
  | 'NOT_INSTALLED'
  | 'LOAD_FAILED'
  | 'TRANSFORM_FAILED'

/**
 * What each stage found. `not-reached` is a real value: a stage after a failed
 * one did not run, and saying so is different from saying it failed.
 */
export type NativeStageResult =
  /** The registry query for the platform package. */
  | 'present'
  | 'absent'
  | 'unreachable'
  /** Whether npm put the platform package in node_modules. */
  | 'missing'
  /** Whether the binding can be required. */
  | 'ok'
  | 'threw'
  | 'no-transform'
  /** Whether a transform completes and produces usable output. */
  | 'diagnostics'
  | 'empty'
  | 'not-reached'

export interface NativeStages {
  readonly platformPackage: NativeStageResult
  readonly installed: NativeStageResult
  readonly loaded: NativeStageResult
  readonly transformed: NativeStageResult
}

/**
 * The status the observed stages imply.
 *
 * Ordered from the earliest stage outward: the first thing that went wrong
 * names the finding, because a later stage's result is meaningless once an
 * earlier one failed.
 */
export function classify(stages: NativeStages): NativeStatus {
  if (
    stages.platformPackage === 'absent' ||
    stages.platformPackage === 'unreachable'
  ) {
    return 'REGISTRY_MISSING'
  }
  if (stages.installed === 'missing') return 'NOT_INSTALLED'
  if (stages.loaded === 'threw' || stages.loaded === 'no-transform') {
    return 'LOAD_FAILED'
  }
  if (
    stages.transformed === 'threw' ||
    stages.transformed === 'diagnostics' ||
    stages.transformed === 'empty'
  ) {
    return 'TRANSFORM_FAILED'
  }
  // Only one combination reaches here: every stage reported its success value.
  // A stage still marked `not-reached` means the caller skipped one, which is a
  // bug in the caller — but returning PASS for it would be the worst possible
  // way to find out, so it is reported as the stage that most likely did not
  // run.
  if (
    stages.platformPackage !== 'present' ||
    stages.installed !== 'present' ||
    stages.loaded !== 'ok' ||
    stages.transformed !== 'ok'
  ) {
    return 'TRANSFORM_FAILED'
  }
  return 'PASS'
}

/**
 * Why a status is worth reporting to a human, in one line.
 *
 * The status alone is an enum in a JSON report; a CI log needs the sentence.
 */
export function describeStatus(status: NativeStatus): string {
  switch (status) {
    case 'PASS':
      return 'installs, loads and compiles'
    case 'REGISTRY_MISSING':
      return 'the platform package is not on the registry — a publishing gap'
    case 'NOT_INSTALLED':
      return 'the platform package is published but npm did not install it — check the npm version first'
    case 'LOAD_FAILED':
      return 'the package is installed but the binding does not load — a build problem (ABI, architecture or libc)'
    case 'TRANSFORM_FAILED':
      return 'the binding loads but does not compile correctly — a compiler problem'
  }
}
