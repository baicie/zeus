import { describe, expect, it } from 'vitest'

import {
  VUE_COPYRIGHT,
  findMissingRequiredPaths,
  findVueLicenseProblems,
} from './release-artifact-utils'

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

describe('findVueLicenseProblems', () => {
  const license = `MIT License\n\n---\n\n${VUE_COPYRIGHT}\n`

  it('accepts a packed LICENSE that keeps the upstream Vue notice', () => {
    expect(findVueLicenseProblems(['dist/x.js', 'LICENSE'], license)).toEqual(
      [],
    )
  })

  it('reports a LICENSE missing from the tarball', () => {
    expect(findVueLicenseProblems(['dist/x.js'], license)).toEqual([
      'LICENSE is not present in the npm tarball',
    ])
  })

  it('reports a LICENSE without the upstream Vue notice', () => {
    expect(
      findVueLicenseProblems(
        ['LICENSE'],
        'MIT License\n\nCopyright (c) Zeus\n',
      ),
    ).toEqual(['LICENSE does not retain the upstream Vue copyright notice'])
    expect(findVueLicenseProblems(['LICENSE'], undefined)).toEqual([
      'LICENSE does not retain the upstream Vue copyright notice',
    ])
  })
})
