/**
 * Reads SLSA provenance for a published package, and — separately — decides
 * whether it can be trusted.
 *
 * The distinction is the point of this module. An earlier version decoded the
 * DSSE payload, pulled `resolvedDependencies[].digest.gitCommit` out of it, and
 * returned that as the source commit. Nothing checked the signature, the
 * certificate, the transparency log, the signing identity, or whether the
 * statement was about the package under test at all. A payload an attacker can
 * author by hand was treated the same as one a build produced, because the only
 * test applied was "is this 40 hexadecimal characters".
 *
 * So there are two functions and the difference between them is enforced by
 * their return types:
 *
 *   parseAttestationStatement  — data only. Says nothing about trust.
 *   verifyAttestation          — a signature over that data, checked against
 *                                Sigstore's trust root, with the identity and
 *                                the subject bound to what we expect.
 *
 * `VerifiedAttestation` cannot be constructed by parsing. Only `verifyAttestation`
 * produces one, so a caller that wants a commit it can rely on has to go
 * through verification to get it.
 *
 * Verification itself is delegated to `sigstore`, the maintained client for
 * Sigstore. This module does not implement cryptography; it decides *policy* —
 * which identity is acceptable, which repository and ref, which subject digest
 * — and lets the library decide *validity*.
 */
import { createHash } from 'node:crypto'

import { createVerifier, type Bundle, type VerifyOptions } from 'sigstore'

export const SLSA_PROVENANCE_V1 = 'https://slsa.dev/provenance/v1'

/** The repository whose packages this repository ships. */
export const EXPECTED_REPOSITORY = 'baicie/zeus-ui'

/** Where npm publishes SLSA provenance for a package version. */
export function attestationUrl(
  name: string,
  version: string,
  registry = 'https://registry.npmjs.org',
): string {
  /*
   * The registry route wants the scope slash encoded (`@scope%2fpkg`) but the
   * `@` between package and version left alone. Encoding the whole
   * `name@version` turns that `@` into `%40`, which the registry does not
   * route — the request 404s and every package looks unattested.
   */
  return `${registry}/-/npm/v1/attestations/${encodeURIComponent(name).replace(
    '%40',
    '@',
  )}@${version}`
}

/**
 * What an attestation statement *says*, with no judgement about whether it is
 * true. Reaching this type means the payload parsed; it does not mean anyone
 * signed it, or that the signer is trusted.
 */
export interface ParsedAttestation {
  readonly predicateType: string
  /** The repository the build came from, per the statement. */
  readonly repository?: string
  /** The ref the build came from, per the statement. */
  readonly ref?: string
  /** The commit the build came from, per the statement. */
  readonly commit?: string
  /** Digests of the package the statement is about, keyed by algorithm. */
  readonly subject: Readonly<Record<string, string>>
  /** The package name in the subject, as the statement spells it. */
  readonly subjectName?: string
}

/**
 * An attestation whose signature, identity and subject have all been checked.
 *
 * The brand (`verified: true`) exists so this cannot be built from parsed data
 * by accident: a caller holding one can rely on the commit, and there is no
 * path to one that skips `verifyAttestation`.
 */
export interface VerifiedAttestation {
  readonly verified: true
  readonly commit: string
  readonly repository: string
  readonly ref?: string
  /** The signing identity Sigstore confirmed. */
  readonly signerIdentity: string
  readonly signerIssuer: string
  /** How many transparency-log entries backed the signature. */
  readonly tlogEntries: number
}

/** Why verification did not produce a trustworthy result. */
export type AttestationFailure =
  | { readonly kind: 'missing'; readonly detail: string }
  | {
      readonly kind: 'invalid'
      readonly detail: string
      readonly errors: readonly string[]
    }
  | { readonly kind: 'infrastructure'; readonly detail: string }

export type AttestationResult =
  | { readonly ok: true; readonly attestation: VerifiedAttestation }
  | { readonly ok: false; readonly failure: AttestationFailure }

interface AttestationEntry {
  readonly predicateType?: unknown
  readonly bundle?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Extracts the statement from a bundle. No verification happens here.
 *
 * Every field is optional on purpose: a statement that does not name a
 * repository or a commit still parses, and it is `verifyAttestation`'s job to
 * refuse it. Returning a `ParsedAttestation` must never be read as approval.
 */
export function parseAttestationStatement(
  bundle: unknown,
): ParsedAttestation | undefined {
  if (!isRecord(bundle)) return undefined
  const envelope = bundle.dsseEnvelope
  if (!isRecord(envelope)) return undefined
  const payload = envelope.payload
  if (typeof payload !== 'string') return undefined

  let document: unknown
  try {
    document = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
  } catch {
    return undefined
  }
  if (!isRecord(document)) return undefined
  const predicateType = document.predicateType
  if (typeof predicateType !== 'string') return undefined

  const subject: Record<string, string> = {}
  let subjectName: string | undefined
  if (Array.isArray(document.subject)) {
    for (const entry of document.subject) {
      if (!isRecord(entry)) continue
      if (typeof entry.name === 'string') subjectName ??= entry.name
      if (!isRecord(entry.digest)) continue
      for (const [algorithm, value] of Object.entries(entry.digest)) {
        if (typeof value === 'string') subject[algorithm] = value
      }
    }
  }

  const parsed: {
    predicateType: string
    subject: Record<string, string>
    subjectName?: string
    repository?: string
    ref?: string
    commit?: string
  } = { predicateType, subject, ...(subjectName ? { subjectName } : {}) }

  const predicate = document.predicate
  if (isRecord(predicate) && isRecord(predicate.buildDefinition)) {
    const definition = predicate.buildDefinition
    const dependencies = Array.isArray(definition.resolvedDependencies)
      ? definition.resolvedDependencies
      : []
    for (const dependency of dependencies) {
      if (!isRecord(dependency)) continue
      const uri = dependency.uri
      const digest = dependency.digest
      if (typeof uri !== 'string' || !isRecord(digest)) continue
      const commit = digest.gitCommit
      if (typeof commit !== 'string') continue
      /*
       * `git+https://github.com/baicie/zeus-ui@refs/tags/v0.1.0-beta.34`
       * -> repository `baicie/zeus-ui`, ref `refs/tags/v0.1.0-beta.34`.
       */
      const match =
        /^git\+https:\/\/github\.com\/([^/@]+)\/([^/@]+)(?:@(.+))?$/.exec(uri)
      if (!match) continue
      parsed.repository = `${match[1]}/${match[2]}`
      if (match[3]) parsed.ref = match[3]
      parsed.commit = commit
      break
    }
  }
  return parsed
}

/** Finds the SLSA v1 entry among a registry's attestation list. */
export function findSlsaBundle(response: unknown): unknown | undefined {
  if (!isRecord(response) || !Array.isArray(response.attestations)) {
    return undefined
  }
  for (const entry of response.attestations as AttestationEntry[]) {
    if (!isRecord(entry)) continue
    if (entry.predicateType !== SLSA_PROVENANCE_V1) continue
    return entry.bundle
  }
  return undefined
}

export interface VerifyAttestationOptions {
  /** The package the attestation must be about. */
  readonly name: string
  readonly version: string
  /** The repository the build must have come from. */
  readonly repository?: string
  /** The ref the build must have come from, when the caller knows it. */
  readonly expectedRef?: string
  /** The tarball's sha512, hex or base64, to bind the subject to the bytes. */
  readonly expectedSha512?: string
  /** Injectable for tests; defaults to `sigstore`'s network-backed verifier. */
  readonly verifier?: (
    bundle: Bundle,
    options: VerifyOptions,
  ) => Promise<VerifiedSigner>
  /** Overrides for the Sigstore trust settings. */
  readonly sigstore?: VerifyOptions
}

export interface VerifiedSigner {
  readonly identity: string
  readonly issuer: string
  readonly tlogEntries: number
}

/**
 * The identity npm's GitHub Actions publisher holds.
 *
 * npm publishes from a workflow file at a ref; Sigstore records exactly that
 * as the certificate's subject alternative name. Pinning the repository and the
 * workflow path is what turns "some GitHub Actions workflow signed this" into
 * "the zeus-ui publish workflow at this tag signed this".
 */
export function expectedSignerIdentity(
  repository: string,
  ref: string,
): string {
  return `https://github.com/${repository}/.github/workflows/publish.yml@${ref}`
}

const GITHUB_ACTIONS_ISSUER = 'https://token.actions.githubusercontent.com'

async function defaultVerifier(
  bundle: Bundle,
  options: VerifyOptions,
): Promise<VerifiedSigner> {
  const verifier = await createVerifier(options)
  const signer = verifier.verify(bundle)
  const identity = signer.identity
  /*
   * `subjectAlternativeName` is optional in Sigstore's own types: a key-based
   * signer has no certificate identity at all. npm's GitHub publisher always
   * has one, so an empty string here is a fact worth surfacing — it will fail
   * the identity comparison rather than being quietly accepted.
   *
   * `identity` itself is optional for the same reason, so an absent one is
   * treated as "signed by nobody we can name" rather than dereferenced.
   */
  const subject = identity?.subjectAlternativeName ?? ''
  const extension = identity?.extensions
  const issuer = isRecord(extension)
    ? String((extension as { issuer?: unknown }).issuer ?? '')
    : ''
  /*
   * `verify` returning means the signature, the certificate chain, the
   * transparency log and the identity policy all held. The tlog count is read
   * back from the bundle because Sigstore reports it there rather than through
   * the signer.
   */
  const material = (bundle as { verificationMaterial?: unknown })
    .verificationMaterial
  let tlogEntries = 0
  if (isRecord(material)) {
    const entries = material.tlogEntries
    if (Array.isArray(entries)) tlogEntries = entries.length
  }
  return {
    identity: subject,
    issuer,
    tlogEntries,
  }
}

/** Normalises a `sha512-…` integrity string or bare digest to lowercase hex. */
export function sha512ToHex(value: string): string | undefined {
  const body = value.startsWith('sha512-')
    ? value.slice('sha512-'.length)
    : value
  if (body.length === 0) return undefined
  if (/^[0-9a-f]{128}$/i.test(body)) return body.toLowerCase()
  try {
    const buffer = Buffer.from(body, 'base64')
    if (buffer.length !== 64) return undefined
    return buffer.toString('hex')
  } catch {
    return undefined
  }
}

/** Computes the sha512 of bytes as hex, for binding a subject to a tarball. */
export function sha512Of(bytes: Buffer): string {
  return createHash('sha512').update(bytes).digest('hex')
}

/**
 * Decides whether a bundle can be trusted for a package, and returns the
 * commit only if it can.
 *
 * The checks run in the order that fails fastest and says the most:
 *   1. the statement parses and is SLSA v1;
 *   2. its subject names this package at this version, with the right digest;
 *   3. its source is the expected repository at the expected ref;
 *   4. Sigstore verifies the signature against a pinned identity.
 *
 * Step 4 is what makes the rest meaningful. Steps 1–3 read fields an attacker
 * controls; only the signature makes those fields trustworthy.
 */
export async function verifyAttestation(
  bundle: unknown,
  options: VerifyAttestationOptions,
): Promise<AttestationResult> {
  const repository = options.repository ?? EXPECTED_REPOSITORY
  const parsed = parseAttestationStatement(bundle)
  if (!parsed) {
    return {
      ok: false,
      failure: {
        kind: 'invalid',
        detail: 'attestation has no readable DSSE statement',
        errors: ['payload missing or not valid base64 JSON'],
      },
    }
  }

  const errors: string[] = []
  if (parsed.predicateType !== SLSA_PROVENANCE_V1) {
    errors.push(
      `predicateType ${parsed.predicateType} is not ${SLSA_PROVENANCE_V1}`,
    )
  }

  /*
   * The subject is a purl: `pkg:npm/%40zeus-web/button@0.1.0-beta.34`. Compare
   * the decoded name and version rather than string-matching the escaped form,
   * so a differently-escaped but equivalent purl still matches.
   */
  if (!parsed.subjectName) {
    errors.push('attestation names no subject')
  } else {
    const decoded = decodeURIComponent(parsed.subjectName)
    const expected = `pkg:npm/${options.name}@${options.version}`
    if (decoded !== expected) {
      errors.push(
        `subject ${decoded} is not the package under test (${expected})`,
      )
    }
  }

  if (options.expectedSha512) {
    const want = sha512ToHex(options.expectedSha512)
    const got = parsed.subject.sha512
    if (!want) {
      errors.push('expected tarball digest could not be normalised')
    } else if (!got) {
      errors.push('attestation subject carries no sha512 digest')
    } else if (sha512ToHex(got) !== want) {
      errors.push(
        `subject sha512 ${got.slice(0, 16)}… does not match the tarball ${want.slice(0, 16)}…`,
      )
    }
  }

  if (parsed.repository !== repository) {
    errors.push(
      `attestation source repository ${String(parsed.repository)} is not ${repository}`,
    )
  }
  if (options.expectedRef !== undefined && parsed.ref !== options.expectedRef) {
    errors.push(
      `attestation source ref ${String(parsed.ref)} is not ${options.expectedRef}`,
    )
  }
  if (!parsed.commit) {
    errors.push('attestation names no source commit')
  }

  if (errors.length > 0) {
    return {
      ok: false,
      failure: {
        kind: 'invalid',
        detail: 'attestation does not describe this package',
        errors,
      },
    }
  }
  const commit = parsed.commit as string

  /*
   * Everything above read fields the statement's author chose. This is the only
   * step an author cannot forge, so it runs even when the fields look right.
   */
  const ref = parsed.ref
  const identity = expectedSignerIdentity(
    repository,
    options.expectedRef ?? ref ?? '',
  )
  const verifier = options.verifier ?? defaultVerifier
  let signer: VerifiedSigner
  try {
    signer = await verifier(bundle as Bundle, {
      certificateIdentityURI: identity,
      tlogThreshold: 1,
      ctLogThreshold: 1,
      ...options.sigstore,
    })
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: 'invalid',
        detail: 'Sigstore did not verify the signature',
        errors: [
          `${(error as Error).constructor.name}: ${String((error as Error).message).slice(0, 300)}`,
        ],
      },
    }
  }

  if (signer.identity !== identity) {
    return {
      ok: false,
      failure: {
        kind: 'invalid',
        detail: 'signing identity is not the publish workflow',
        errors: [`signed by ${signer.identity}, expected ${identity}`],
      },
    }
  }
  if (signer.issuer !== GITHUB_ACTIONS_ISSUER) {
    return {
      ok: false,
      failure: {
        kind: 'invalid',
        detail: 'certificate was not issued by GitHub Actions',
        errors: [`issuer ${signer.issuer}`],
      },
    }
  }

  return {
    ok: true,
    attestation: {
      verified: true,
      commit,
      repository,
      ...(ref ? { ref } : {}),
      signerIdentity: signer.identity,
      signerIssuer: signer.issuer,
      tlogEntries: signer.tlogEntries,
    },
  }
}
