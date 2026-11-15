/**
 * Every blocker must land in a category, and the categories must be the
 * distinctions a reader needs.
 *
 * The previous split decided from string prefixes and had one bucket for
 * everything that did not match. Two problems: `code: []` could mean "no code
 * defect" or "no blocker started with a phrase I recognised", and missing
 * evidence was indistinguishable from stale evidence — although the fix
 * differs (produce it vs. re-collect it).
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const manifestPath = path.join(
  root,
  'docs/release/0.2.0-rc-manifest-candidate.json',
)

interface Candidate {
  blockers?: string[]
  blockerCategories?: Record<string, string[]>
}

describe('RC candidate blocker categories', () => {
  const exists = fs.existsSync(manifestPath)
  const candidate: Candidate = exists
    ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Candidate)
    : {}

  it('classifies every blocker', () => {
    if (!exists) return
    const categorised = Object.values(candidate.blockerCategories ?? {}).flat()
    expect(
      categorised.sort(),
      'each blocker must appear in exactly one category',
    ).toEqual([...(candidate.blockers ?? [])].sort())
  })

  it('leaves nothing unclassified', () => {
    if (!exists) return
    expect(candidate.blockerCategories?.unclassified ?? []).toEqual([])
  })

  it('distinguishes stale evidence from missing evidence', () => {
    if (!exists) return
    const stale = candidate.blockerCategories?.['evidence stale'] ?? []
    const missing = candidate.blockerCategories?.['evidence missing'] ?? []
    // Both buckets exist because both kinds occur; a single bucket would hide
    // that one of them is a re-collection and the other is a production run.
    expect(stale.length + missing.length).toBeGreaterThan(0)
    for (const entry of stale) {
      expect(entry).not.toMatch(/not produced/)
    }
  })

  it('does not put a version cut or a first publish under code', () => {
    if (!exists) return
    const code = candidate.blockerCategories?.['code defect'] ?? []
    for (const entry of code) {
      expect(entry).not.toMatch(/^versions are/)
      expect(entry).not.toMatch(/^never published/)
    }
  })
})
