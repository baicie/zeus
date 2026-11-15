/**
 * What a product actually installs from the UI, as opposed to what it claims.
 *
 * `build-info.json` carries one `uiCommit`, copied from the repository variable
 * `ZEUS_UI_COMMIT`. That value names a commit in `baicie/zeus-ui`, but neither
 * image ever checks that commit out:
 *
 * - Admin installs 24 `@zeus-web/*` packages from the npm registry at an exact
 *   version, plus one `@zeus-web/dialog` from `vendor/`, built from a commit
 *   that is not the recorded one;
 * - Playground installs nothing from `@zeus-web/*` — it is Core-only, so its
 *   `uiCommit` names a repository the build never reads.
 *
 * A single commit cannot describe either build. This module records the real
 * inputs as data, so `build-info.json` can carry both the *declared pairing*
 * (what the release intends) and the *actual sources* (what the bytes came
 * from), and a reader can tell them apart.
 *
 * `uiCommit` keeps its meaning — the declared pairing — for compatibility with
 * every consumer that already reads it. It is not redefined as "the source".
 */
import fs from 'node:fs'
import path from 'node:path'

export const UI_SOURCES_SCHEMA = 'zeus.ui-sources/v1'

/** Where a package's bytes came from. */
export type UiSourceKind = 'registry' | 'vendored' | 'workspace'

export interface RegistryUiSource {
  readonly kind: 'registry'
  readonly package: string
  readonly version: string
  /**
   * The `integrity` the lockfile resolves for this exact version.
   *
   * This binds the recorded version to the bytes pnpm will install. Without it
   * "registry 0.1.0-beta.34" says what was asked for, not what was fetched.
   * `null` means the lockfile has no entry, which is itself a finding.
   */
  readonly integrity: string | null
  /**
   * The UI commit this package was built from.
   *
   * A published package carries a SLSA v1 attestation whose
   * `resolvedDependencies` names this commit; `readAttestationSource` extracts
   * it. Supply the result through `attestationSources` when collecting, and
   * the value becomes checkable rather than asserted.
   *
   * `UNVERIFIED` means no attestation was available for this package. It is
   * never the declared pairing commit — that is a different fact, and putting
   * it here is the mistake this field exists to prevent.
   */
  readonly sourceCommit: 'UNVERIFIED' | string
  /** Where `sourceCommit` came from, when it came from somewhere. */
  readonly sourceCommitProvenance?: 'attestation'
}

export interface VendoredUiSource {
  readonly kind: 'vendored'
  readonly package: string
  readonly version: string
  /** The commit the vendored build was produced from. */
  readonly commit: string
  /** Digest of the vendored directory's canonical file list. */
  readonly contentDigest: string
}

export interface WorkspaceUiSource {
  readonly kind: 'workspace'
  readonly package: string
  readonly version: string
}

export type UiSource = RegistryUiSource | VendoredUiSource | WorkspaceUiSource

/**
 * The four questions a single `readsUiRepository` boolean conflated.
 *
 * v1 set `readsUiRepository = sources.length > 0`, which answers "does this
 * build install any `@zeus-web/*` package" — not "does it check out the UI
 * repository". For Admin both happen to be false-ish and true-ish in ways that
 * made the field look right, and for Playground the name was simply wrong: it
 * never reads the repository *and* installs no packages, so one `false` stood
 * for two different facts.
 */
export interface UiRepositoryRelationship {
  /** Installs at least one `@zeus-web/*` package, from any source. */
  readonly usesWebPackages: boolean
  /**
   * Checks out `baicie/zeus-ui` in this build. Neither example does: Admin
   * installs from the registry plus a vendored directory, Playground installs
   * nothing.
   */
  readonly checksOutUiRepository: boolean
  /** Installs at least one `@zeus-web/*` package from the npm registry. */
  readonly consumesRegistryPackages: boolean
  /** Installs at least one `@zeus-web/*` package from `vendor/`. */
  readonly consumesVendoredBuild: boolean
}

export interface UiSources {
  readonly schema: typeof UI_SOURCES_SCHEMA
  /**
   * The pairing commit the release declares. Equal to `build-info.uiCommit`.
   * Naming it here makes explicit that it is a claim, not an observation.
   */
  readonly declaredPairingCommit: string
  /** The four facts the v1 boolean conflated. */
  readonly relationship: UiRepositoryRelationship
  /**
   * @deprecated v1 field, kept so an older reader does not break.
   *
   * It equals `relationship.usesWebPackages`. It never meant "checks out the
   * UI repository" — see `relationship.checksOutUiRepository`, which is false
   * for every product in this repository.
   */
  readonly readsUiRepository: boolean
  readonly sources: readonly UiSource[]
}

/**
 * The `sourceCommit` fields for a registry package.
 *
 * When an attestation was read for this exact `name@version`, the commit is
 * checkable and `sourceCommitProvenance` says so. When none was read, the field
 * stays `UNVERIFIED` — that records what this run knows, and must not be read
 * as a claim that no attestation exists.
 */
function sourceCommitFields(
  name: string,
  version: string,
  attested: Readonly<Record<string, { readonly commit: string }>> | undefined,
): { sourceCommit: string; sourceCommitProvenance?: 'attestation' } {
  const entry = attested?.[`${name}@${version}`]
  if (entry && /^[0-9a-f]{40}$/.test(entry.commit)) {
    return { sourceCommit: entry.commit, sourceCommitProvenance: 'attestation' }
  }
  return { sourceCommit: 'UNVERIFIED' }
}

function readManifest(file: string): {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
} | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as {
      name?: string
      version?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
  } catch {
    return null
  }
}

/**
 * Collects the UI inputs of one example package.
 *
 * `vendoredProvenance` maps a `file:` dependency to the provenance document of
 * the directory it points at. Only the dialog is vendored today; the map keeps
 * the shape honest if a second package ever is.
 */
/**
 * The `integrity` pnpm records for a package at an exact version.
 *
 * Read from the `packages:` section, which is keyed `name@version`. The
 * importer section names a version but not its bytes; only this section binds
 * them.
 */
export function lockfileIntegrity(
  lockfile: string,
  name: string,
  version: string,
): string | null {
  // Keys may be quoted: `'@zeus-web/button@0.1.0-beta.34':`.
  const key = `${name}@${version}`
  const lines = lockfile.split('\n')
  for (const [index, line] of lines.entries()) {
    const header = /^ {2}'?([^':]+)'?:\s*$/.exec(line)
    if (!header || header[1] !== key) continue
    for (const next of lines.slice(index + 1, index + 6)) {
      const resolution = /^ {4}resolution:\s*\{integrity:\s*(\S+?)\}/.exec(next)
      if (resolution)
        return (resolution[1] ?? '').replace(/^sha512-/, 'sha512-')
      if (/^ {2}\S/.test(next)) break
    }
  }
  return null
}

export function collectUiSources(options: {
  readonly manifestPath: string
  readonly root: string
  readonly declaredPairingCommit: string
  /**
   * Whether this build checks out `baicie/zeus-ui`. Defaults to false; the
   * examples establish it by not cloning the repository.
   */
  readonly checksOutUiRepository?: boolean
  /** Contents of `pnpm-lock.yaml`, used to bind registry versions to bytes. */
  readonly lockfile?: string
  /**
   * Source commits read from each package's SLSA attestation, keyed
   * `name@version`. Absent means nothing was read — the commit stays
   * `UNVERIFIED`, which is a statement about this run, not about the package.
   */
  readonly attestationSources?: Readonly<
    Record<string, { readonly commit: string }>
  >
  readonly vendoredProvenance?: Readonly<
    Record<string, { commit: string; contentDigest: string; version: string }>
  >
}): UiSources {
  const manifest = readManifest(options.manifestPath)
  if (!manifest) {
    throw new Error(`cannot read ${options.manifestPath}`)
  }
  const sources: UiSource[] = []
  const seen = new Set<string>()
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
  ] as const) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (!name.startsWith('@zeus-web/')) continue
      if (seen.has(name)) continue
      seen.add(name)
      if (version.startsWith('file:')) {
        const target = path
          .resolve(
            path.dirname(options.manifestPath),
            version.slice('file:'.length),
          )
          .replace(/\/+$/, '')
        const provenance = options.vendoredProvenance?.[name]
        const observed = provenance ?? readVendoredProvenance(target)
        if (!observed) {
          throw new Error(
            `${name} is a file: dependency but ${target} has no provenance.json`,
          )
        }
        sources.push({
          kind: 'vendored',
          package: name,
          version: observed.version,
          commit: observed.commit,
          contentDigest: observed.contentDigest,
        })
        continue
      }
      if (version.startsWith('workspace:')) {
        sources.push({ kind: 'workspace', package: name, version })
        continue
      }
      sources.push({
        kind: 'registry',
        package: name,
        version,
        integrity: options.lockfile
          ? lockfileIntegrity(options.lockfile, name, version)
          : null,
        ...sourceCommitFields(name, version, options.attestationSources),
      })
    }
  }
  sources.sort((left, right) => (left.package < right.package ? -1 : 1))
  const usesWebPackages = sources.length > 0
  return {
    schema: UI_SOURCES_SCHEMA,
    declaredPairingCommit: options.declaredPairingCommit,
    relationship: {
      usesWebPackages,
      // No build in this repository checks out the UI repository. If one ever
      // does, it must set this from an observed fact, not from a manifest scan.
      checksOutUiRepository: options.checksOutUiRepository ?? false,
      consumesRegistryPackages: sources.some(
        source => source.kind === 'registry',
      ),
      consumesVendoredBuild: sources.some(source => source.kind === 'vendored'),
    },
    // Kept equal to `usesWebPackages` so v1 readers see the same value they
    // always did, with the deprecation note explaining what it never meant.
    readsUiRepository: usesWebPackages,
    sources,
  }
}

function readVendoredProvenance(directory: string): {
  commit: string
  contentDigest: string
  version: string
} | null {
  try {
    const document = JSON.parse(
      fs.readFileSync(path.join(directory, 'provenance.json'), 'utf8'),
    ) as { commit?: string; contentDigest?: string; version?: string }
    if (!document.commit || !document.contentDigest || !document.version) {
      return null
    }
    return {
      commit: document.commit,
      contentDigest: document.contentDigest,
      version: document.version,
    }
  } catch {
    return null
  }
}

export interface VerifyUiSourcesResult {
  readonly errors: readonly string[]
}

/**
 * Checks a recorded `uiSources` against the manifest and the repository.
 *
 * Everything here compares an assertion to an observation. A `uiSources` block
 * that merely repeats what the build wrote is worthless — these rules make the
 * document falsifiable:
 *
 * - every registry package the manifest pins is present at that exact version;
 * - every vendored package's commit and digest match the committed provenance;
 * - nothing is listed that the manifest does not declare;
 * - the declared pairing commit matches the one in `build-info.uiCommit`.
 */
/**
 * How strict a verification is.
 *
 * `legacy-compatible` exists so a build-info written before `integrity` and
 * `relationship` were recorded still verifies. It is not a mode a release may
 * use.
 *
 * `release-strict` is what a release gate must pass: the lockfile is required,
 * every registry package must resolve to bytes, and a v2 document must carry
 * `relationship`. A gate that can be satisfied by omitting its inputs is not a
 * `relationship` were recorded still verifies — those documents cannot be
 * checked for things they do not contain. It is not a mode a release may use.
 * every registry package must resolve to bytes, and the document must agree
 * with all of it. A gate that can be satisfied by omitting its inputs is not a
 * gate, which is why the level is explicit rather than inferred from whether a
 * lockfile happened to be passed.
 */
export type VerificationLevel = 'legacy-compatible' | 'release-strict'

export function verifyUiSources(options: {
  readonly sources: UiSources
  readonly manifestPath: string
  readonly root: string
  readonly expectedPairingCommit?: string
  /** Contents of `pnpm-lock.yaml`; required for `release-strict`. */
  readonly lockfile?: string
  /** Source commits read from SLSA attestations, keyed `name@version`. */
  readonly attestationSources?: Readonly<
    Record<string, { readonly commit: string }>
  >
  /**
   * Defaults to `legacy-compatible` so existing callers keep their behaviour.
   * Any release or RC gate must pass `release-strict`.
   */
  readonly level?: VerificationLevel
}): VerifyUiSourcesResult {
  const errors: string[] = []
  const fail = (message: string): void => {
    errors.push(message)
  }
  const level: VerificationLevel = options.level ?? 'legacy-compatible'

  if (level === 'release-strict') {
    /*
     * Each of these is something strict mode cannot check without. Failing
     * here rather than silently skipping is the point of the mode: a strict run
     * that quietly omits a check reports the same green as one that performed
     * it.
     * Each of these is something strict mode cannot check without it. Failing
     * here rather than silently skipping is the whole point of the mode: a
     * strict run that quietly omits a check reports the same green as one that
     * performed it.
     */
    if (!options.lockfile) {
      fail(
        'release-strict requires the lockfile: registry integrity cannot be verified without it',
      )
    }
    if (!options.expectedPairingCommit) {
      fail(
        'release-strict requires the declared pairing commit from build-info.uiCommit',
      )
    }
    if (!options.sources.relationship) {
      fail(
        'release-strict requires a ui-sources v2 document; the v1 boolean does not record relationship',
      )
    }
  }

  /*
   * `sources` is unvalidated JSON from a build artifact. A document written by
   * an older or broken build can carry `sources: 5`, an object, or entries
   * without a `package` — and `.map` on any of those throws a TypeError out of
   * a function whose contract is to return errors.
   */
  const rawSources = Array.isArray(options.sources.sources)
    ? options.sources.sources
    : undefined
  if (!rawSources) {
    fail('uiSources.sources must be an array')
    return { errors }
  }

  /*
   * A Map keyed by package name silently keeps the last entry, so a wrong
   * source can be overwritten by a right one — or the reverse, depending on
   * order — and the document still passes. Duplicates are reported, and the
   * first entry is kept so the comparison below is against something stable.
   */
  const recorded = new Map<string, (typeof rawSources)[number]>()
  for (const [index, source] of rawSources.entries()) {
    if (
      typeof source !== 'object' ||
      source === null ||
      typeof (source as { package?: unknown }).package !== 'string'
    ) {
      fail(`uiSources.sources[${index}] has no package name`)
      continue
    }
    const name = (source as { package: string }).package
    if (recorded.has(name)) {
      fail(
        `uiSources.sources declares ${name} more than once; a duplicate can hide a wrong entry`,
      )
      continue
    }
    recorded.set(name, source)
  }

  /*
   * Re-derive the expected set with the same inputs as the document under
   * test. Omitting either of these makes the comparison reject a correct
   * document: without the lockfile every `want.integrity` is null, and without
   * the attestation sources every attested commit looks unbacked.
   */
  const expected = collectUiSources({
    manifestPath: options.manifestPath,
    root: options.root,
    declaredPairingCommit: options.sources.declaredPairingCommit,
    ...(options.lockfile ? { lockfile: options.lockfile } : {}),
    ...(options.attestationSources
      ? { attestationSources: options.attestationSources }
      : {}),
    // Without this every `want.integrity` is null and the comparison below
    // rejects a document that is exactly right. The lockfile is the only
    // source of the expected bytes; re-deriving without it is not a check.
  })
  const declared = new Map(
    expected.sources.map(source => [source.package, source]),
  )

  // The manifest is the source of truth for which packages exist.
  for (const [name, want] of declared) {
    const got = recorded.get(name)
    if (!got) {
      fail(`missing from uiSources: ${name}`)
      continue
    }
    if (got.kind !== want.kind) {
      fail(`${name}: recorded as ${got.kind}, manifest says ${want.kind}`)
      continue
    }
    if (got.version !== want.version) {
      fail(
        `${name}: recorded version ${got.version}, manifest pins ${want.version}`,
      )
    }
    if (got.kind === 'registry' && want.kind === 'registry') {
      /*
       * The recorded integrity must be the one the lockfile resolves for this
       * exact version. A registry entry without it says what was asked for,
       * not what was fetched. Skipped when no lockfile was supplied, so a v1
       * document — which has no `integrity` field — still verifies.
       */
      if (options.lockfile) {
        if (want.integrity === null) {
          fail(
            `${name}: the lockfile has no integrity for ${want.version}; the version cannot be bound to bytes`,
          )
        } else if (got.integrity !== want.integrity) {
          fail(
            `${name}: recorded integrity ${String(got.integrity)} does not match the lockfile ${want.integrity}`,
          )
        }
      }
      /*
       * No mechanism ties a published version to a zeus-ui commit. A document
       * that names one is asserting something this repository cannot know.
       */
      /*
       * A specific commit is allowed only when this run actually read it from
       * an attestation. Anything else is an assertion with nothing behind it —
       * the failure this rule exists to stop is a document naming the declared
       * pairing commit as if it were the source.
       */
      const claimed = got.sourceCommit
      if (claimed !== 'UNVERIFIED') {
        const attested = sourceCommitFields(
          name,
          want.version,
          options.attestationSources,
        )
        if (
          attested.sourceCommit !== claimed ||
          attested.sourceCommit === 'UNVERIFIED'
        ) {
          fail(
            `${name}: sourceCommit ${String(claimed)} is not backed by an attestation read in this run; record UNVERIFIED or supply attestationSources`,
          )
        }
      } else if (level === 'release-strict') {
        /*
         * `UNVERIFIED` used to pass here, and it was the only value the real
         * pipeline ever produced: `build-info.ts` never supplies
         * `attestationSources`, so every release document recorded that nothing
         * was known and the strict gate reported the same green as a fully
         * attested one. The rule was "a claimed commit must be backed"; a
         * package that claimed nothing was skipped entirely.
         *
         * The document is written inside a Docker build, which has no network
         * and must not gain one, so `UNVERIFIED` there is honest: the build
         * genuinely does not know. Strict mode is where the gap closes — the
         * verify step runs where the registry is reachable, so it must resolve
         * the commit itself. A document that recorded ignorance is accepted
         * only when this run actually read the attestation for it.
         */
        const attested = sourceCommitFields(
          name,
          want.version,
          options.attestationSources,
        )
        if (attested.sourceCommit === 'UNVERIFIED') {
          fail(
            `${name}: sourceCommit is UNVERIFIED and no attestation was read for it in this run, so the published bytes are not bound to a zeus-ui commit`,
          )
        }
      }
    }
    if (got.kind === 'vendored' && want.kind === 'vendored') {
      if (got.commit !== want.commit) {
        fail(
          `${name}: vendored commit ${got.commit} does not match the committed provenance ${want.commit}`,
        )
      }
      if (got.contentDigest !== want.contentDigest) {
        fail(
          `${name}: vendored contentDigest ${got.contentDigest} does not match ${want.contentDigest}`,
        )
      }
    }
  }
  for (const name of recorded.keys()) {
    if (!declared.has(name)) {
      fail(`${name} is recorded but not declared by the manifest`)
    }
  }

  if (
    options.expectedPairingCommit !== undefined &&
    options.sources.declaredPairingCommit !== options.expectedPairingCommit
  ) {
    fail(
      `declared pairing commit ${options.sources.declaredPairingCommit} does not match build-info uiCommit ${options.expectedPairingCommit}`,
    )
  }

  if (options.sources.readsUiRepository !== recorded.size > 0) {
    fail(
      `readsUiRepository is ${String(options.sources.readsUiRepository)} but ${recorded.size} sources are recorded`,
    )
  }

  /*
   * v2: the four explicit facts must agree with the source list, and a
   * document that claims to check out the UI repository must say which commit
   * it actually checked out — the declared pairing is not that answer.
   */
  const relationship = options.sources.relationship
  if (relationship) {
    if (relationship.usesWebPackages !== recorded.size > 0) {
      fail(
        `relationship.usesWebPackages is ${String(relationship.usesWebPackages)} but ${recorded.size} sources are recorded`,
      )
    }
    const hasRegistry = [...recorded.values()].some(
      source => source.kind === 'registry',
    )
    const hasVendored = [...recorded.values()].some(
      source => source.kind === 'vendored',
    )
    if (relationship.consumesRegistryPackages !== hasRegistry) {
      fail(
        `relationship.consumesRegistryPackages is ${String(relationship.consumesRegistryPackages)} but ${hasRegistry ? 'registry' : 'no registry'} sources are recorded`,
      )
    }
    if (relationship.consumesVendoredBuild !== hasVendored) {
      fail(
        `relationship.consumesVendoredBuild is ${String(relationship.consumesVendoredBuild)} but ${hasVendored ? 'a vendored' : 'no vendored'} source is recorded`,
      )
    }
    if (relationship.checksOutUiRepository) {
      fail(
        'relationship.checksOutUiRepository is true, but no ui-sources field records the checked-out commit; a build that clones baicie/zeus-ui must record that SHA',
      )
    }
  }

  return { errors }
}
