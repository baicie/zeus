/**
 * Single source of truth for the version being released.
 *
 * The dist-tag policy used to read the root `package.json`, which is not the
 * release group root (`@zeus-js/zeus` is). A mismatch there could silently
 * skip the RC gate. Here every trustworthy source must agree:
 *
 * - an explicit `--version`;
 * - the tag that triggered the release (`vX.Y.Z`);
 * - the `@zeus-js/zeus` workspace package version.
 *
 * The root package version is recorded for diagnostics only. It is allowed to
 * differ and never decides whether the gate runs.
 */
export interface ReleaseVersionSources {
  readonly explicit?: string | undefined
  readonly tag?: string | undefined
  readonly env?: string | undefined
  readonly zeusPackage?: string | undefined
  readonly rootPackage?: string | undefined
}

export interface ResolvedReleaseVersion {
  readonly version?: string
  readonly rc: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
  readonly sources: Readonly<Record<string, string | undefined>>
}

export function normalizeVersion(
  value: string | undefined,
): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  return trimmed.startsWith('v') ? trimmed.slice(1) : trimmed
}

export function isRcVersion(version: string): boolean {
  return /-rc\.\d+(?:\.|$)/i.test(version)
}

export function resolveReleaseVersion(
  sources: ReleaseVersionSources,
): ResolvedReleaseVersion {
  const authoritative = {
    explicit: normalizeVersion(sources.explicit),
    tag: normalizeVersion(sources.tag),
    env: normalizeVersion(sources.env),
    zeusPackage: normalizeVersion(sources.zeusPackage),
  }
  const rootPackage = normalizeVersion(sources.rootPackage)
  const errors: string[] = []
  const warnings: string[] = []
  const values = Object.entries(authoritative).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )
  if (values.length === 0) {
    errors.push(
      'no release version source is available (--version, tag, ZEUS_RELEASE_VERSION or @zeus-js/zeus)',
    )
    return {
      rc: false,
      errors,
      warnings,
      sources: { ...authoritative, rootPackage },
    }
  }
  const distinct = [...new Set(values.map(([, value]) => value))]
  if (distinct.length > 1) {
    errors.push(
      `release version sources disagree: ${values
        .map(([name, value]) => `${name}=${value}`)
        .join(', ')}`,
    )
  }
  const version = distinct[0]
  if (version && rootPackage && rootPackage !== version) {
    warnings.push(
      `root package.json version ${rootPackage} differs from release version ${version}`,
    )
  }
  return {
    ...(version ? { version } : {}),
    rc: version ? isRcVersion(version) : false,
    errors,
    warnings,
    sources: { ...authoritative, rootPackage },
  }
}
