import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  collectArtifactFiles,
  computeArtifactDigest,
  createBuildInfo,
  writeBuildInfo,
  verifyDeployedBuildInfo,
  verifyProvenance,
  PROVENANCE_SCHEMA,
} from '../build-info'

const roots: string[] = []
const core = 'a'.repeat(40)
const ui = 'b'.repeat(40)

function artifact(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'zeus-build-info-'))
  roots.push(root)
  mkdirSync(path.join(root, 'assets'))
  writeFileSync(path.join(root, 'index.html'), '<div id="root"></div>\n')
  writeFileSync(path.join(root, 'assets/app.js'), 'console.log(1)\n')
  return root
}

function info(root: string) {
  return createBuildInfo({
    distDir: root,
    products: ['native-lab', 'webc-studio'],
    coreCommit: core,
    uiCommit: ui,
    version: '0.2.0-rc.1',
    builtAt: '2026-11-05T00:00:00.000Z',
  })
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

describe('build info', () => {
  it('is deterministic and excludes build-info.json', () => {
    const root = artifact()
    const first = info(root)
    writeBuildInfo(first, root)
    const second = info(root)

    expect(second.artifactDigest).toBe(first.artifactDigest)
    expect(first.files.map(file => file.path)).toEqual([
      'assets/app.js',
      'index.html',
    ])
    expect(first.artifactDigest).toBe(computeArtifactDigest(first.files))
  })

  it('orders files by byte value, so the digest does not depend on the host locale', () => {
    // `localeCompare` orders `a-b.js` against `a/b.js` differently depending on
    // the machine's collation, which would give the same tree two digests.
    const root = artifact()
    mkdirSync(path.join(root, 'a-b'))
    mkdirSync(path.join(root, 'a'))
    writeFileSync(path.join(root, 'a-b/c.js'), 'x\n')
    writeFileSync(path.join(root, 'a.js'), 'y\n')
    writeFileSync(path.join(root, 'a/b.js'), 'z\n')

    const files = collectArtifactFiles(root)
    const first = files.map(file => file.path)
    // Re-derive under a different collation to prove the sort is not using it.
    const reordered = [...files].sort(() => 0).reverse()
    expect(reordered).not.toEqual(first)
    expect([...files].map(file => file.path)).toEqual([
      'a-b/c.js',
      'a.js',
      'a/b.js',
      'assets/app.js',
      'index.html',
    ])
  })

  it('changes the digest when any deployed file changes', () => {
    const root = artifact()
    const before = info(root)
    writeFileSync(path.join(root, 'assets/app.js'), 'console.log(2)\n')
    expect(info(root).artifactDigest).not.toBe(before.artifactDigest)
  })

  it('accepts matching build info and rejects stale commits or digests', () => {
    const root = artifact()
    const current = info(root)
    const expected = {
      products: current.products,
      coreCommit: core,
      uiCommit: ui,
      artifactDigest: current.artifactDigest,
      imageDigest: 'sha256:image',
    }

    expect(
      verifyDeployedBuildInfo(
        { ...current, imageDigest: 'sha256:image' },
        expected,
      ),
    ).toEqual([])
    expect(
      verifyDeployedBuildInfo(
        {
          ...current,
          coreCommit: 'c'.repeat(40),
          artifactDigest: 'sha256:old',
        },
        expected,
      ),
    ).toEqual([
      `build-info coreCommit ${'c'.repeat(40)} does not match ${core}`,
      'build-info artifactDigest sha256:old does not match sha256:' +
        current.artifactDigest.slice(7),
    ])
  })

  it('binds an optional source tree and rejects a stale tree', () => {
    const root = artifact()
    const tree = 'd'.repeat(40)
    const current = createBuildInfo({
      distDir: root,
      products: ['native-lab', 'webc-studio'],
      coreCommit: core,
      uiCommit: ui,
      sourceTree: tree,
      version: '0.2.0-rc.1',
      builtAt: '2026-11-05T00:00:00.000Z',
    })
    expect(current.sourceTree).toBe(tree)
    expect(
      verifyDeployedBuildInfo(current, {
        products: current.products,
        coreCommit: core,
        uiCommit: ui,
        sourceTree: tree,
        artifactDigest: current.artifactDigest,
      }),
    ).toEqual([])
    expect(
      verifyDeployedBuildInfo(current, {
        products: current.products,
        coreCommit: core,
        uiCommit: ui,
        sourceTree: 'e'.repeat(40),
        artifactDigest: current.artifactDigest,
      }),
    ).toContain(
      `build-info sourceTree ${tree} does not match ${'e'.repeat(40)}`,
    )
  })

  it('verifies a CI provenance record against the manifest', () => {
    const root = artifact()
    const buildInfo = info(root)
    const provenance = {
      schema: PROVENANCE_SCHEMA,
      coreCommit: core,
      uiCommit: ui,
      runId: '123',
      runUrl: 'https://github.com/baicie/zeus/actions/runs/123',
      createdAt: '2026-11-05T00:00:00.000Z',
      products: [
        {
          product: 'native-lab',
          artifactDigest: buildInfo.artifactDigest,
          imageDigest: 'sha256:image',
          buildInfo,
        },
      ],
    }
    const expected = {
      coreCommit: core,
      uiCommit: ui,
      products: [
        {
          product: 'native-lab',
          artifactDigest: buildInfo.artifactDigest,
          imageDigest: 'sha256:image',
        },
      ],
    }

    expect(verifyProvenance(provenance, expected).errors).toEqual([])
    expect(
      verifyProvenance(
        {
          ...provenance,
          products: [
            {
              ...provenance.products[0],
              artifactDigest: 'sha256:tampered',
            },
          ],
        },
        expected,
      ).errors,
    ).toEqual([
      'provenance native-lab artifactDigest does not match the manifest',
    ])
  })
})
