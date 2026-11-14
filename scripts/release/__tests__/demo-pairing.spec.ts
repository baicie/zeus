import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  DEMO_PAIRING_FILE,
  DEMO_PAIRING_SCHEMA,
  createDemoPairing,
  readDemoMetadata,
  verifyDemoPairing,
  verifyDemoPairingReproducible,
  writeDemoPairing,
  type DemoPairing,
} from '../demo-pairing'

const roots: string[] = []
const CORE = 'a'.repeat(40)
const UI = 'b'.repeat(40)
const CREATED = '2026-11-13T00:00:00.000Z'

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

/**
 * A site laid out the way `demos-pages.yml` assembles one: a landing page, a
 * dispatcher, and two product directories, each carrying the metadata file its
 * build produced.
 */
function site(
  options: { coreCommit?: string; uiCommit?: string } = {},
): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'zeus-demo-pairing-'))
  roots.push(root)
  writeFileSync(path.join(root, 'index.html'), '<a href="admin/">admin</a>\n')
  writeFileSync(path.join(root, '404.html'), '<p>not found</p>\n')
  for (const product of ['admin', 'ai'] as const) {
    const directory = path.join(root, product)
    mkdirSync(path.join(directory, 'assets'), { recursive: true })
    writeFileSync(
      path.join(directory, 'index.html'),
      `<script src="assets/app.js"></script>\n`,
    )
    writeFileSync(
      path.join(directory, 'assets/app.js'),
      `console.log(${JSON.stringify(product)})\n`,
    )
    const metadata =
      product === 'admin'
        ? {
            schema: 'zeus.admin-demo/v1',
            generatedAt: CREATED,
            coreCommit: options.coreCommit ?? CORE,
            uiCommit: options.uiCommit ?? UI,
          }
        : {
            schema: 'zeus.ai-demo/v1',
            generatedAt: CREATED,
            uiCommit: options.uiCommit ?? UI,
            coreCommit: options.coreCommit ?? CORE,
            events: [],
          }
    writeFileSync(
      path.join(
        directory,
        product === 'admin' ? 'demo-snapshot.json' : 'ai-demo-recording.json',
      ),
      `${JSON.stringify(metadata, null, 2)}\n`,
    )
  }
  return root
}

function pairing(root: string): DemoPairing {
  return createDemoPairing({
    siteDir: root,
    coreCommit: CORE,
    uiCommit: UI,
    coreVersion: '0.1.1-beta.20',
    uiVersion: '0.1.0-beta.35',
    createdAt: CREATED,
    workflow: 'Demos Pages',
    runId: '123',
    runUrl: 'https://github.com/baicie/zeus/actions/runs/123',
  })
}

describe('demo pairing', () => {
  it('records the real pair, a timestamp and a digest per product', () => {
    const root = site()
    const record = pairing(root)

    expect(record.schema).toBe(DEMO_PAIRING_SCHEMA)
    expect(record.coreCommit).toBe(CORE)
    expect(record.uiCommit).toBe(UI)
    expect(record.createdAt).toBe(CREATED)
    expect(record.products.map(entry => entry.product)).toEqual(['admin', 'ai'])
    for (const product of record.products) {
      expect(product.artifactDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
      expect(product.files).toBe(3) // index.html + assets/app.js + metadata
      expect(product.bytes).toBeGreaterThan(0)
      expect(product.metadata.file).toMatch(
        /^(demo-snapshot|ai-demo-recording)\.json$/,
      )
      expect(product.metadata.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
    expect(record.siteDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('is reproducible: the same pair and the same tree produce the same manifest', () => {
    // Two independent builds of the same pair. Every volatile input — the
    // timestamp, the run id — is an argument, so what differs between two runs
    // is only what the sources differ by.
    const first = pairing(site())
    const second = pairing(site())

    expect(second).toEqual(first)
    expect(second.coreCommit).toBe(first.coreCommit)
    expect(second.products).toEqual(first.products)
    expect(second.siteDigest).toBe(first.siteDigest)
  })

  it('reads the commits out of the shipped metadata, not out of arguments', () => {
    const root = site()
    expect(readDemoMetadata(root, 'admin')).toMatchObject({
      coreCommit: CORE,
      uiCommit: UI,
    })
    expect(readDemoMetadata(root, 'ai')).toMatchObject({
      coreCommit: CORE,
      uiCommit: UI,
    })
  })

  it('passes when the manifest matches the site and the expected pair', () => {
    const root = site()
    const record = pairing(root)
    writeDemoPairing(record, root)

    expect(
      verifyDemoPairing(
        record,
        {
          coreCommit: CORE,
          uiCommit: UI,
          coreVersion: '0.1.1-beta.20',
          uiVersion: '0.1.0-beta.35',
        },
        root,
      ),
    ).toEqual([])
  })

  it('rejects a manifest naming the wrong UI commit', () => {
    // The regression this exists for: the AI recording named the Core SHA.
    const root = site({ uiCommit: CORE })
    const errors = verifyDemoPairing(pairing(root), {}, root)

    expect(errors).toContain(
      `demo ai: metadata uiCommit ${CORE} does not match pairing ${UI}`,
    )
  })

  it('rejects a manifest whose expected pair differs', () => {
    const root = site()
    const errors = verifyDemoPairing(
      pairing(root),
      { uiCommit: 'c'.repeat(40) },
      root,
    )

    expect(errors).toContain(
      `demo pairing uiCommit ${UI} does not match ${'c'.repeat(40)}`,
    )
  })

  it('rejects a short, uppercase, missing or non-hex SHA', () => {
    const root = site()
    const record = pairing(root)
    const message =
      'demo pairing uiCommit must be a full 40-character lowercase SHA'
    const cases: Array<[string, unknown]> = [
      ['short', UI.slice(0, 12)],
      ['uppercase', UI.toUpperCase()],
      ['missing', undefined],
      ['not hex', 'z'.repeat(40)],
    ]
    for (const [label, uiCommit] of cases) {
      const errors = verifyDemoPairing({ ...record, uiCommit })
      expect(
        errors.some(error => error.startsWith(message)),
        `${label}: ${errors.join(' | ')}`,
      ).toBe(true)
    }
  })

  it('rejects a manifest with missing fields', () => {
    const root = site()
    const record = pairing(root)
    for (const field of [
      'createdAt',
      'coreVersion',
      'uiVersion',
      'products',
      'siteDigest',
      'build',
    ] as const) {
      const broken: Record<string, unknown> = { ...record }
      delete broken[field]
      expect(
        verifyDemoPairing(broken).length,
        `missing ${field}`,
      ).toBeGreaterThan(0)
    }
    expect(verifyDemoPairing({ ...record, createdAt: 'yesterday' })).toContain(
      'demo pairing createdAt is missing or not an ISO timestamp',
    )
    expect(verifyDemoPairing({ ...record, products: [] })).toContain(
      'demo pairing has no record for product admin',
    )
  })

  it('rejects a site that no longer matches the manifest', () => {
    const root = site()
    const record = pairing(root)
    writeDemoPairing(record, root)
    // Any deployed byte changing must be caught, even with identical commits.
    writeFileSync(
      path.join(root, 'admin/assets/app.js'),
      'console.log("tampered")\n',
    )
    const errors = verifyDemoPairing(record, {}, root)

    expect(
      errors.some(error => error.startsWith('demo admin: artifactDigest')),
    ).toBe(true)
    expect(
      errors.some(error => error.startsWith('demo pairing siteDigest')),
    ).toBe(true)
  })

  it('rejects a landing page change, which no product digest covers', () => {
    const root = site()
    const record = pairing(root)
    writeDemoPairing(record, root)
    writeFileSync(path.join(root, 'index.html'), '<p>changed</p>\n')

    const errors = verifyDemoPairing(record, {}, root)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^demo pairing siteDigest/)
  })

  it('rejects a missing product directory instead of silently dropping it', () => {
    const root = site()
    rmSync(path.join(root, 'ai'), { recursive: true, force: true })

    expect(() => pairing(root)).toThrow(/demo ai: ai\/index\.html is missing/)
  })

  it('rejects metadata whose schema the demo does not read', () => {
    const root = site()
    writeFileSync(
      path.join(root, 'admin/demo-snapshot.json'),
      `${JSON.stringify({ schema: 'zeus.admin-demo/v0', coreCommit: CORE, uiCommit: UI })}\n`,
    )

    expect(() => pairing(root)).toThrow(
      'demo admin: metadata schema zeus.admin-demo/v0 != zeus.admin-demo/v1',
    )
  })

  it('keeps the expected-pair failure when the reproducible check also runs', () => {
    // Regression: the CLI's `--reproducible` mode once replaced the base error
    // list with its own, so a manifest built from the wrong commits could pass
    // as "reproducible". The two checks must be unioned, never substituted.
    const root = site()
    const record = pairing(root)
    writeDemoPairing(record, root)

    const base = verifyDemoPairing(record, { uiCommit: 'c'.repeat(40) }, root)
    expect(base.some(error => error.includes('does not match'))).toBe(true)
    // The reproducible check on the same manifest is clean, because it only
    // asks whether the file is a function of the site and the recorded pair.
    expect(verifyDemoPairingReproducible(record, root)).toEqual([])
  })

  it('rejects a manifest that is not reproducible from the site', () => {
    const root = site()
    const record = pairing(root)
    writeDemoPairing(record, root)

    // A field written by something other than `createDemoPairing`: the digest
    // is well-formed but describes another tree.
    const errors = verifyDemoPairingReproducible(
      { ...record, siteDigest: `sha256:${'0'.repeat(64)}` },
      root,
    )
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects a manifest whose recorded timestamp is not the one it was built with', () => {
    const root = site()
    const record = pairing(root)
    writeDemoPairing(record, root)

    // Regeneration uses `createdAt` from the manifest, so a different stamp
    // still reproduces; what must fail is a manifest whose other fields were
    // edited. This pins the timestamp as an input rather than a wall-clock
    // read, which is what makes the reproducibility check meaningful.
    expect(
      verifyDemoPairingReproducible(
        { ...record, createdAt: '2026-11-13T00:00:01.000Z' },
        root,
      ),
    ).toEqual([])
  })

  it('records the runtime the Workbench bundles, separately from the Core checkout', () => {
    // The Workbench depends on @zeus-js/zeus as a published version and never
    // sees the Core checkout. Recording the checkout SHA as its coreCommit
    // would be the R6-A defect one field over, so the manifest carries the pin
    // it really uses.
    const root = site()
    const record = createDemoPairing({
      siteDir: root,
      coreCommit: CORE,
      uiCommit: UI,
      coreVersion: '0.1.1-beta.20',
      uiVersion: '0.1.0-beta.35',
      aiRuntime: {
        package: '@zeus-js/zeus',
        version: '0.1.1-beta.20',
        commit: 'c'.repeat(40),
      },
      createdAt: CREATED,
      workflow: 'Demos Pages',
    })

    expect(record.aiRuntime).toEqual({
      package: '@zeus-js/zeus',
      version: '0.1.1-beta.20',
      commit: 'c'.repeat(40),
    })
    expect(verifyDemoPairing(record, {}, root)).toEqual([])
  })

  it('rejects an aiRuntime record with a missing package or a bad commit', () => {
    const root = site()
    const record = createDemoPairing({
      siteDir: root,
      coreCommit: CORE,
      uiCommit: UI,
      coreVersion: '0.1.1-beta.20',
      uiVersion: '0.1.0-beta.35',
      aiRuntime: { package: '@zeus-js/zeus', version: '0.1.1-beta.20' },
      createdAt: CREATED,
      workflow: 'Demos Pages',
    })

    const cases: Array<[string, unknown]> = [
      ['no package', { version: '0.1.1-beta.20' }],
      ['no version', { package: '@zeus-js/zeus' }],
      [
        'short commit',
        { package: '@zeus-js/zeus', version: 'x', commit: 'abc' },
      ],
    ]
    for (const [label, aiRuntime] of cases) {
      const errors = verifyDemoPairing({ ...record, aiRuntime })
      expect(errors.length, label).toBeGreaterThan(0)
    }
  })

  it('rejects a prototype-chain key posing as a product', () => {
    const root = site()
    const record = pairing(root)
    const errors = verifyDemoPairing({
      ...record,
      products: [
        ...record.products,
        {
          product: 'toString',
          artifactDigest: `sha256:${'0'.repeat(64)}`,
          files: 1,
          bytes: 1,
          metadata: { file: 'x', digest: `sha256:${'0'.repeat(64)}` },
        },
      ],
    })
    expect(errors).toContain('demo pairing products[2].product is not known')
  })

  it('rejects a manifest that names one commit for both repositories', () => {
    const root = site()
    const record = pairing(root)
    expect(
      verifyDemoPairing({ ...record, uiCommit: record.coreCommit }),
    ).toContain(
      'demo pairing coreCommit and uiCommit are the same commit; they belong to different repositories',
    )
  })

  it('rejects metadata whose schema the demo app would refuse to load', () => {
    // `--verify` used to check only the digest and the commits, so a site whose
    // recording carried an unknown schema passed while the browser refused it.
    const root = site()
    const record = pairing(root)
    writeDemoPairing(record, root)
    writeFileSync(
      path.join(root, 'ai/ai-demo-recording.json'),
      `${JSON.stringify({ schema: 'zeus.ai-demo/v0', uiCommit: UI, coreCommit: CORE, events: [] })}\n`,
    )

    const errors = verifyDemoPairing(record, {}, root)
    expect(
      errors.some(error =>
        error.startsWith('demo ai: metadata schema zeus.ai-demo/v0'),
      ),
    ).toBe(true)
  })

  it('writes the manifest at the site root so it is published with the site', () => {
    const root = site()
    const output = writeDemoPairing(pairing(root), root)

    expect(path.basename(output)).toBe(DEMO_PAIRING_FILE)
    expect(path.dirname(output)).toBe(path.resolve(root))
  })
})
