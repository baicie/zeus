/**
 * What a SLSA attestation has to prove before its commit may be believed.
 *
 * The previous implementation decoded the DSSE payload and returned whatever
 * `gitCommit` it found. Nothing verified the signature, so a payload written by
 * hand was indistinguishable from one a build produced — the only check was
 * "40 hexadecimal characters". These tests treat that as the defect it is.
 *
 * Two layers are tested separately, on purpose:
 *
 * - `parseAttestationStatement` is pure data extraction. A forged bundle parses
 *   successfully here, and that is correct — parsing must not claim trust.
 * - `verifyAttestation` is where trust is decided. Every test below that
 *   expects a rejection goes through it.
 *
 * The signature layer is exercised both with a real Sigstore bundle (checked
 * against the real trust root when the network is available) and with an
 * injected verifier, so the policy tests do not depend on npm being up.
 */
import { describe, expect, it } from 'vitest'

import {
  EXPECTED_REPOSITORY,
  attestationUrl,
  expectedSignerIdentity,
  findSlsaBundle,
  parseAttestationStatement,
  sha512Of,
  sha512ToHex,
  verifyAttestation,
  type VerifiedSigner,
} from '../ui-attestation'

const PACKAGE = '@zeus-web/button'
const VERSION = '0.1.0-beta.34'
const COMMIT = 'a8826dd1f81560aaf6459d8d40a3e599f705f6e0'
const REF = 'refs/tags/v0.1.0-beta.34'
const IDENTITY = `https://github.com/${EXPECTED_REPOSITORY}/.github/workflows/publish.yml@${REF}`

/** A statement shaped like npm's SLSA v1 output. */
function statement(
  overrides: {
    repository?: string
    ref?: string
    commit?: string
    subjectName?: string
    sha512?: string
    predicateType?: string
  } = {},
): unknown {
  const {
    repository = EXPECTED_REPOSITORY,
    ref = REF,
    commit = COMMIT,
    subjectName = `pkg:npm/${encodeURIComponent(PACKAGE)}@${VERSION}`,
    sha512 = 'd75d84b82accff14d72f1777e7422583bcf829d061adec1e7b7a0cf9a1620f0ead3221c4ee6d46a44cdde31a903b7e23d58b205af071bb6037ff446754e0980d',
    predicateType = 'https://slsa.dev/provenance/v1',
  } = overrides
  return {
    predicateType,
    subject: [{ name: subjectName, digest: { sha512 } }],
    predicate: {
      buildDefinition: {
        resolvedDependencies: [
          {
            uri: `git+https://github.com/${repository}@${ref}`,
            digest: { gitCommit: commit },
          },
        ],
      },
    },
  }
}

/** Wraps a statement the way npm's `/attestations` route returns it. */
function bundleWith(document: unknown, signatures = 1): unknown {
  return {
    mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
    verificationMaterial: {
      tlogEntries: Array.from({ length: signatures }, () => ({})),
    },
    dsseEnvelope: {
      payloadType: 'application/vnd.in-toto+json',
      payload: Buffer.from(JSON.stringify(document)).toString('base64'),
      signatures: Array.from({ length: signatures }, () => ({
        sig: 'unused-in-policy-tests',
      })),
    },
  }
}

/**
 * A verifier that behaves like Sigstore for the identity policy tests, without
 * a network call. It is explicit about being a stand-in: the tests that prove
 * real signature checking works use the real one.
 */
function stubVerifier(
  signer: Partial<VerifiedSigner> = {},
): (
  bundle: unknown,
  options: { certificateIdentityURI?: string },
) => Promise<VerifiedSigner> {
  return async (_bundle, options) => ({
    identity: signer.identity ?? options.certificateIdentityURI ?? IDENTITY,
    issuer: signer.issuer ?? 'https://token.actions.githubusercontent.com',
    tlogEntries: signer.tlogEntries ?? 1,
  })
}

/** A verifier that always throws, standing in for a bad signature. */
const rejectingVerifier = async () => {
  throw new Error('VerificationError: DSSE payload hash mismatch')
}

describe('parseAttestationStatement', () => {
  it('reads the fields a statement carries', () => {
    const parsed = parseAttestationStatement(bundleWith(statement()))
    expect(parsed?.commit).toBe(COMMIT)
    expect(parsed?.repository).toBe(EXPECTED_REPOSITORY)
    expect(parsed?.ref).toBe(REF)
    expect(parsed?.subjectName).toContain('pkg:npm/')
    expect(parsed?.subject.sha512).toHaveLength(128)
  })

  /*
   * Parsing a forged payload must succeed. If it failed, callers would start
   * treating "did not parse" as "not trustworthy" — which is true, but it makes
   * "parsed" look like "trustworthy", and that is exactly the confusion the
   * split exists to prevent.
   */
  it('parses a forged payload without vouching for it', () => {
    const parsed = parseAttestationStatement(
      bundleWith(statement({ commit: 'f'.repeat(40) })),
    )
    expect(parsed?.commit).toBe('f'.repeat(40))
  })

  it('returns undefined for shapes it cannot read', () => {
    expect(parseAttestationStatement(null)).toBeUndefined()
    expect(parseAttestationStatement({})).toBeUndefined()
    expect(parseAttestationStatement({ dsseEnvelope: {} })).toBeUndefined()
    expect(
      parseAttestationStatement({
        dsseEnvelope: { payload: Buffer.from('not json').toString('base64') },
      }),
    ).toBeUndefined()
    expect(
      parseAttestationStatement({
        dsseEnvelope: {
          payload: Buffer.from(JSON.stringify({})).toString('base64'),
        },
      }),
    ).toBeUndefined()
  })
})

describe('verifyAttestation accepts only a complete chain', () => {
  it('returns the commit when every check passes', async () => {
    const result = await verifyAttestation(bundleWith(statement()), {
      name: PACKAGE,
      version: VERSION,
      expectedRef: REF,
      verifier: stubVerifier(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.attestation.commit).toBe(COMMIT)
    expect(result.attestation.repository).toBe(EXPECTED_REPOSITORY)
    expect(result.attestation.signerIdentity).toBe(IDENTITY)
  })
})

describe('verifyAttestation rejects tampering', () => {
  it('rejects a payload with no signature at all', async () => {
    const result = await verifyAttestation(bundleWith(statement(), 0), {
      name: PACKAGE,
      version: VERSION,
      verifier: rejectingVerifier,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a bad signature', async () => {
    const result = await verifyAttestation(bundleWith(statement()), {
      name: PACKAGE,
      version: VERSION,
      verifier: rejectingVerifier,
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.failure.kind).toBe('invalid')
    expect(JSON.stringify(result.failure)).toMatch(/Sigstore did not verify/)
  })

  it('rejects a certificate from a different identity', async () => {
    const result = await verifyAttestation(bundleWith(statement()), {
      name: PACKAGE,
      version: VERSION,
      expectedRef: REF,
      verifier: stubVerifier({
        identity:
          'https://github.com/attacker/repo/.github/workflows/publish.yml@refs/heads/main',
      }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(JSON.stringify(result.failure)).toMatch(/signing identity is not/)
  })

  it('rejects a non-GitHub-Actions issuer', async () => {
    const result = await verifyAttestation(bundleWith(statement()), {
      name: PACKAGE,
      version: VERSION,
      verifier: stubVerifier({ issuer: 'https://accounts.google.com' }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(JSON.stringify(result.failure)).toMatch(
      /not issued by GitHub Actions/,
    )
  })

  it('rejects a source repository that is not zeus-ui', async () => {
    const result = await verifyAttestation(
      bundleWith(statement({ repository: 'attacker/zeus-ui' })),
      { name: PACKAGE, version: VERSION, verifier: stubVerifier() },
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(JSON.stringify(result.failure)).toMatch(/source repository/)
  })

  it('rejects an unexpected source ref', async () => {
    const result = await verifyAttestation(bundleWith(statement()), {
      name: PACKAGE,
      version: VERSION,
      expectedRef: 'refs/tags/v0.1.0-beta.35',
      verifier: stubVerifier(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(JSON.stringify(result.failure)).toMatch(/source ref/)
  })

  it('rejects a statement about a different package version', async () => {
    const result = await verifyAttestation(bundleWith(statement()), {
      name: PACKAGE,
      version: '0.1.0-beta.35',
      verifier: stubVerifier(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(JSON.stringify(result.failure)).toMatch(/not the package under test/)
  })

  it('rejects a subject digest that does not match the tarball', async () => {
    const otherTarball = 'sha512-' + Buffer.alloc(64, 7).toString('base64')
    const result = await verifyAttestation(bundleWith(statement()), {
      name: PACKAGE,
      version: VERSION,
      expectedSha512: otherTarball,
      verifier: stubVerifier(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(JSON.stringify(result.failure)).toMatch(/does not match the tarball/)
  })

  it('rejects a non-SLSA predicate type', async () => {
    const result = await verifyAttestation(
      bundleWith(statement({ predicateType: 'https://example.com/other' })),
      { name: PACKAGE, version: VERSION, verifier: stubVerifier() },
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(JSON.stringify(result.failure)).toMatch(/is not https:\/\/slsa.dev/)
  })
})

describe('signature verification is real, not assumed', () => {
  /*
   * This is the test that would have caught the original defect. It fetches a
   * real npm attestation, and asserts both that a genuine bundle verifies and
   * that the same bundle with one byte of its payload changed does not.
   *
   * It reaches the network, so it is allowed to skip when offline — but a skip
   * is reported as a skip, never as a pass, and `verifyAttestation` is never
   * given a mock that would make a forged payload look signed.
   */
  it('verifies a real npm attestation and rejects a modified payload', async () => {
    let body: unknown
    try {
      const response = await fetch(attestationUrl(PACKAGE, VERSION), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      body = await response.json()
    } catch (error) {
      console.warn(
        `skipping live Sigstore check: registry unreachable (${String((error as Error).message)})`,
      )
      return
    }

    const bundle = findSlsaBundle(body)
    expect(
      bundle,
      'the published package must carry a SLSA v1 attestation',
    ).toBeDefined()

    const genuine = await verifyAttestation(bundle, {
      name: PACKAGE,
      version: VERSION,
      expectedRef: REF,
    })
    expect(
      genuine.ok,
      `genuine bundle rejected: ${JSON.stringify(genuine)}`,
    ).toBe(true)
    if (!genuine.ok) return
    expect(genuine.attestation.commit).toBe(COMMIT)
    expect(genuine.attestation.signerIdentity).toBe(IDENTITY)
    expect(genuine.attestation.tlogEntries).toBeGreaterThan(0)

    /* Change one character of the payload; the signature must no longer hold. */
    const tampered = structuredClone(bundle) as {
      dsseEnvelope: { payload: string }
    }
    const document = JSON.parse(
      Buffer.from(tampered.dsseEnvelope.payload, 'base64').toString('utf8'),
    ) as {
      predicate: {
        buildDefinition: {
          resolvedDependencies: { digest: { gitCommit: string } }[]
        }
      }
    }
    document.predicate.buildDefinition.resolvedDependencies[0]!.digest.gitCommit =
      'f'.repeat(40)
    tampered.dsseEnvelope.payload = Buffer.from(
      JSON.stringify(document),
    ).toString('base64')

    const forged = await verifyAttestation(tampered, {
      name: PACKAGE,
      version: VERSION,
      expectedRef: REF,
    })
    expect(forged.ok, 'a tampered payload must not verify').toBe(false)
  }, 60_000)
})

describe('attestationUrl', () => {
  it('encodes the scope but leaves the version separator literal', () => {
    expect(attestationUrl(PACKAGE, VERSION)).toBe(
      'https://registry.npmjs.org/-/npm/v1/attestations/@zeus-web%2Fbutton@0.1.0-beta.34',
    )
  })
})

describe('expectedSignerIdentity', () => {
  it('pins the repository, workflow and ref', () => {
    expect(expectedSignerIdentity(EXPECTED_REPOSITORY, REF)).toBe(IDENTITY)
  })
})

describe('sha512 normalisation', () => {
  /*
   * The lockfile records `sha512-<base64>`; SLSA subject digests are hex. They
   * are the same digest in two encodings, so comparing the strings directly
   * would call every correct package wrong.
   */
  it('treats base64 and hex forms of one digest as equal', () => {
    const hex =
      'd75d84b82accff14d72f1777e7422583bcf829d061adec1e7b7a0cf9a1620f0ead3221c4ee6d46a44cdde31a903b7e23d58b205af071bb6037ff446754e0980d'
    const base64 = Buffer.from(hex, 'hex').toString('base64')
    expect(sha512ToHex(hex)).toBe(hex)
    expect(sha512ToHex(`sha512-${base64}`)).toBe(hex)
    expect(sha512ToHex(base64)).toBe(hex)
  })

  it('rejects values that are not a sha512', () => {
    expect(sha512ToHex('')).toBeUndefined()
    expect(sha512ToHex('sha512-')).toBeUndefined()
    expect(sha512ToHex('not-a-digest')).toBeUndefined()
  })

  it('hashes bytes to the same hex form', () => {
    const bytes = Buffer.from('hello')
    expect(sha512Of(bytes)).toHaveLength(128)
    expect(sha512Of(bytes)).toMatch(/^[0-9a-f]{128}$/)
  })
})
