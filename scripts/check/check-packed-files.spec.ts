import { describe, expect, it } from 'vitest'

import {
  findMissingPackedFiles,
  resolveNpmPackCommand,
} from './check-packed-files'

describe('findMissingPackedFiles', () => {
  it('reports required files that are absent from the package tarball', () => {
    expect(
      findMissingPackedFiles(
        ['index.cjs', 'dist/vite-plugin.esm-bundler.js'],
        ['dist/vite-plugin.d.ts'],
      ),
    ).toEqual(['dist/vite-plugin.d.ts'])
  })

  it('accepts required files included with platform-specific separators', () => {
    expect(
      findMissingPackedFiles(
        ['index.cjs', 'dist\\vite-plugin.d.ts'],
        ['./dist/vite-plugin.d.ts'],
      ),
    ).toEqual([])
  })

  it('runs npm through cmd.exe on Windows', () => {
    expect(
      resolveNpmPackCommand('win32', 'C:\\Windows\\System32\\cmd.exe'),
    ).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        'npm',
        'pack',
        '--dry-run',
        '--json',
        '--ignore-scripts',
        '--loglevel=error',
      ],
    })
  })

  it('runs npm directly on POSIX platforms', () => {
    expect(resolveNpmPackCommand('linux')).toEqual({
      command: 'npm',
      args: [
        'pack',
        '--dry-run',
        '--json',
        '--ignore-scripts',
        '--loglevel=error',
      ],
    })
  })
})
