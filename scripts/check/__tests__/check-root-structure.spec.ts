/**
 * Every rule in `check-root-structure` gets a positive case (the real tree
 * passes) and a negative case (an injected violation is reported by name).
 *
 * A structure checker that only ever sees a clean tree proves nothing: the
 * scanner it replaces in `boundaries.rs` reported a clean graph on a tree that
 * had a cycle, because it silently dropped the edge it could not resolve.
 * The negative cases are what make these checks real.
 */
import { describe, expect, it } from 'vitest'

import {
  ALLOWED_ROOT_DIRECTORIES,
  checkCurrentPipelineEntry,
  checkForbiddenRootFiles,
  checkIgnoreExceptionOrder,
  checkPipelineDocIsMarkedHistorical,
  checkPinnedDirectories,
  checkRelocatedPaths,
  checkRootDirectories,
  PINNED_ROOT_DIRECTORIES,
  runAllChecks,
} from '../check-root-structure.ts'

describe('the real tree satisfies the root contract', () => {
  it('reports no findings', () => {
    expect(runAllChecks()).toEqual([])
  })
})

describe('an unknown root directory is reported', () => {
  it('accepts every allowed directory', () => {
    expect(checkRootDirectories([...ALLOWED_ROOT_DIRECTORIES])).toEqual([])
  })

  it('names a directory that is not allowed', () => {
    const findings = checkRootDirectories(['packages', 'scratch'])
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('unknown-root-directory')
    expect(findings[0]!.detail).toContain('scratch')
  })

  it('does not flag a new directory that was registered deliberately', () => {
    // The check is a prompt to register, not a veto on new directories.
    const allowed = new Set([...ALLOWED_ROOT_DIRECTORIES, 'experiments'])
    expect(['experiments'].filter(name => !allowed.has(name))).toEqual([])
  })
})

describe('a generated file at the root is reported', () => {
  it('accepts ordinary config and source files', () => {
    expect(
      checkForbiddenRootFiles([
        'package.json',
        'Cargo.toml',
        'tsconfig.json',
        'README.md',
        '.gitignore',
      ]),
    ).toEqual([])
  })

  it.each([
    ['screenshot.png', 'image'],
    ['debug.log', 'log'],
    ['backup.tmp', 'temp file'],
    ['bundle.tgz', 'archive'],
    ['npm-debug.txt', 'package-manager log'],
  ])('reports %s (%s)', file => {
    const findings = checkForbiddenRootFiles([file])
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('forbidden-root-file')
  })

  it('only judges the root, not a file of the same kind further down', () => {
    expect(checkForbiddenRootFiles(['docs/logo.png', 'docs/a.log'])).toEqual([])
  })
})

describe('a pinned directory may not silently disappear', () => {
  it('accepts every pinned directory being present', () => {
    expect(
      checkPinnedDirectories(Object.keys(PINNED_ROOT_DIRECTORIES)),
    ).toEqual([])
  })

  it.each(['release-pairing', 'release-policy', 'vendor', 'deploy'])(
    'names %s and says what depends on it',
    directory => {
      const findings = checkPinnedDirectories(
        Object.keys(PINNED_ROOT_DIRECTORIES).filter(d => d !== directory),
      )
      expect(findings).toHaveLength(1)
      expect(findings[0]!.rule).toBe('pinned-directory-missing')
      expect(findings[0]!.detail).toContain(directory)
      // The reason is part of the contract: a future reader must know what
      // else has to change in the same commit.
      expect(findings[0]!.detail).toContain(PINNED_ROOT_DIRECTORIES[directory]!)
    },
  )
})

describe('a relocated path may not come back', () => {
  it('reports nothing when the old paths are gone', () => {
    expect(checkRelocatedPaths(() => false)).toEqual([])
  })

  it('reports a revived artifacts directory', () => {
    const findings = checkRelocatedPaths(
      relative => relative === 'artifacts/design-acceptance',
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('relocated-path-returned')
    expect(findings[0]!.detail).toContain('docs/acceptance/design')
  })

  it('reports a revived top-level ci report', () => {
    const findings = checkRelocatedPaths(
      relative => relative === 'docs/ci-optimization-baseline.md',
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.detail).toContain('docs/ci/optimization-baseline.md')
  })
})

describe('the vendor ignore exception must follow the rule it excepts', () => {
  const gitignoreInOrder = [
    'node_modules',
    'dist',
    '!vendor/zeus-web-dialog/dist/',
  ].join('\n')

  it('accepts the exception after the exclusion', () => {
    const findings = checkIgnoreExceptionOrder(file =>
      file === '.gitignore' ? gitignoreInOrder : null,
    )
    expect(findings).toEqual([])
  })

  it('reports the exception placed above the exclusion', () => {
    const reversed = [
      '!vendor/zeus-web-dialog/dist/',
      'node_modules',
      'dist',
    ].join('\n')
    const findings = checkIgnoreExceptionOrder(file =>
      file === '.gitignore' ? reversed : null,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('vendor-exception-order')
    expect(findings[0]!.detail).toContain('.gitignore')
  })

  it('reports a missing exception', () => {
    const findings = checkIgnoreExceptionOrder(file =>
      file === '.gitignore' ? 'node_modules\ndist\n' : null,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('vendor-exception-missing')
  })

  it('treats a missing ignore file as nothing to check', () => {
    expect(checkIgnoreExceptionOrder(() => null)).toEqual([])
  })
})

describe('the pipeline document must not present history as current', () => {
  it('accepts a document that declares itself historical', () => {
    const marked = [
      '# 历史快照：R17.0 之前的 Compiler Pipeline',
      '',
      '> 本文是历史快照，不代表现行结构。',
      '',
      'The state of the compiler before R17.0.',
    ].join('\n')
    expect(checkPipelineDocIsMarkedHistorical(() => marked)).toEqual([])
  })

  it('reports a document titled "Current" that records an old revision', () => {
    const unmarked = [
      '# Current Compiler Pipeline',
      '',
      'The state of `crates/zeus_compiler` before R17.0, measured at `649e2f60`.',
      '',
      '├─ lower::lower_module(source, filename)        lower.rs:63',
    ].join('\n')
    const findings = checkPipelineDocIsMarkedHistorical(() => unmarked)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('pipeline-doc-unmarked')
  })

  it('treats a missing document as nothing to check', () => {
    expect(checkPipelineDocIsMarkedHistorical(() => null)).toEqual([])
  })
})

describe('the current pipeline entry point must exist', () => {
  it('accepts its presence', () => {
    expect(
      checkCurrentPipelineEntry(
        p => p === 'docs/architecture/compiler/pipeline.md',
      ),
    ).toEqual([])
  })

  it('reports its absence and names the file', () => {
    const findings = checkCurrentPipelineEntry(() => false)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('pipeline-entry-missing')
    expect(findings[0]!.detail).toContain('pipeline.md')
  })
})
