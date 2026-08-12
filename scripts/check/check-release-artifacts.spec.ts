import { describe, expect, it } from 'vitest'

import { findMissingRequiredPaths } from './release-artifact-utils'

describe('findMissingRequiredPaths', () => {
  it('accepts directory entries when their contents are packed', () => {
    expect(
      findMissingRequiredPaths(
        ['index.cjs', 'dist/runtime-dom.cjs'],
        ['index.cjs', 'dist'],
      ),
    ).toEqual([])
  })

  it('does not require native binaries in regular CI', () => {
    expect(
      findMissingRequiredPaths(['index.js'], ['index.js', 'binary.node']),
    ).toEqual([])
  })

  it('requires native binaries in release verification', () => {
    expect(
      findMissingRequiredPaths(['index.js'], ['index.js', 'binary.node'], {
        requireBinaries: true,
      }),
    ).toEqual(['binary.node'])
  })
})
