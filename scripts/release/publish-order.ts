/**
 * The publish *order* group for each package (R22 TASK 52).
 *
 * `@baicie/release` sorts packages by kind and publishes in that order, so this
 * mapping decides what a partially completed release leaves behind. It lives
 * here, apart from `release.config.ts`, because that file imports
 * `@baicie/release` — which cannot be loaded in this workspace's test process —
 * and a rule this consequential should be testable on its own.
 *
 * ## Why it follows history rather than the directory tree
 *
 * Before the six-domain move every package under `packages/core/` — the
 * runtime, `router`/`query`/`resource`/`i18n`, `testing` and the whole
 * compiler — sorted as `core`. Only the two packages under
 * `packages/devtools/` had no kind, which is why `eslint-plugin` and
 * `playground-engine` published first.
 *
 * Reading the physical directory now would invert that: `features` and
 * `tooling` would become ungrouped and publish *before* `zeus` and
 * `runtime-dom`, which is the opposite of the verified order. The mapping
 * therefore follows what each package was grouped as, not where it sits.
 *
 * ## What that ordering costs, measured
 *
 * rc.3 stopped at the eighth package and the seven before it were the native
 * compiler and its platform packages. `shared`, `signal`, `runtime-dom` and
 * `zeus` all sort after them, so the release shipped a compiler and no
 * framework. `scripts/release/__tests__/publish-order.spec.ts` pins this.
 */
export function packageKind(relativeDir: string): string | undefined {
  if (relativeDir.startsWith('packages/web-c/')) return 'web-c'
  // The two packages that were `packages/devtools/*` published before the
  // compiler and still have no kind. Neither is in the fixed release group
  // except `playground-engine`, but the mapping covers both so the answer
  // does not depend on which group a package happens to be in.
  if (
    relativeDir === 'packages/tooling/eslint-plugin' ||
    relativeDir === 'packages/tooling/playground-engine'
  ) {
    return undefined
  }
  // Everything that was under `packages/core/`: runtime, compiler, features
  // and `testing`.
  return 'core'
}

/**
 * The order a release publishes `packages` in.
 *
 * Mirrors `@baicie/release`: kind first, then name, with "no kind" sorting
 * before every named kind.
 */
export function publishOrder(
  packages: readonly string[],
  directoryOf: (name: string) => string | undefined,
): string[] {
  return [...packages].sort((a, b) => {
    const kindA = kindOf(a, directoryOf)
    const kindB = kindOf(b, directoryOf)
    return (kindA ?? '').localeCompare(kindB ?? '') || a.localeCompare(b)
  })
}

function kindOf(
  name: string,
  directoryOf: (name: string) => string | undefined,
): string | undefined {
  const directory = directoryOf(name)
  if (directory === undefined) {
    throw new Error(`${name} has no directory under packages/`)
  }
  return packageKind(directory)
}
