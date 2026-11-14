/**
 * A historical audit snapshot must stay historical.
 *
 * `docs/release/0.2.0-rc-manifest.json` records the tree the RC-3 audit was
 * performed against. Regenerating it in place would rewrite that record into
 * one that looks like it passed on a later commit — the exact failure mode the
 * audit documents were written to avoid.
 *
 * The candidate snapshot is a separate file. Both may claim `NO_GO`; neither
 * may claim the other's commit.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const historical = path.join(root, 'docs/release/0.2.0-rc-manifest.json')
const candidate = path.join(
  root,
  'docs/release/0.2.0-rc-manifest-candidate.json',
)

interface Manifest {
  schema?: string
  generatedAt?: string
  repositories?: { core?: { commit?: string }; ui?: { commit?: string } }
  verdict?: string
  blockers?: string[]
}

function read(file: string): Manifest | undefined {
  if (!fs.existsSync(file)) return undefined
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest
}

describe('RC manifest history', () => {
  it('keeps the historical snapshot', () => {
    const document = read(historical)
    expect(
      document,
      'the historical manifest must not be deleted',
    ).toBeDefined()
    expect(document?.schema).toBe('zeus.rc-manifest/v1')
  })

  it('does not rewrite the historical snapshot to the current HEAD', () => {
    // The audit ran against 7bc850b7. Whatever main is now, this file keeps
    // describing that moment.
    const document = read(historical)
    expect(
      document?.repositories?.core?.commit,
      'the historical manifest records the audit baseline, not the current tree',
    ).toBe('7bc850b7aa5451b2b1da36ecfa798f5183a2c45c')
  })

  /*
   * The historical verdict must stay NO_GO. If a later change makes the tree
   * releasable, that is a fact about the *new* tree and belongs in the
   * candidate snapshot — rewriting this one would erase the record that the
   * old tree was not releasable.
   */
  it('keeps the historical verdict at NO_GO', () => {
    expect(read(historical)?.verdict).toBe('NO_GO')
  })

  it('records a distinct candidate snapshot when one exists', () => {
    const document = read(candidate)
    if (!document) return
    expect(document.schema).toBe('zeus.rc-manifest/v1')
    expect(
      document.repositories?.core?.commit,
      'the candidate names its own tree',
    ).not.toBe(read(historical)?.repositories?.core?.commit)
  })

  it('never lets the candidate claim the historical commit', () => {
    const document = read(candidate)
    if (!document) return
    expect(document.repositories?.core?.commit).not.toBe(
      '7bc850b7aa5451b2b1da36ecfa798f5183a2c45c',
    )
  })
})
