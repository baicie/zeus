import { describe, expect, it } from 'vitest'

import {
  findTreeShakingFile,
  type TreeShakingFile,
} from './component-host-size'

describe('component-host size bench tree-shaking file lookup', () => {
  const files: TreeShakingFile[] = [
    {
      absolute:
        'D:\\workspace\\git-code\\zeus\\benchmarks\\component-host\\dist\\assets\\bench-button--DcrAJUv.js',
      relative: 'assets/bench-button--DcrAJUv.js',
    },
    {
      absolute:
        'D:\\workspace\\git-code\\zeus\\benchmarks\\component-host\\dist\\assets\\bench-button-shadow-Dqmo7yYl.js',
      relative: 'assets/bench-button-shadow-Dqmo7yYl.js',
    },
    {
      absolute:
        'D:\\workspace\\git-code\\zeus\\benchmarks\\component-host\\dist\\react\\z-bench-button.js',
      relative: 'react/z-bench-button.js',
    },
    {
      absolute:
        'D:\\workspace\\git-code\\zeus\\benchmarks\\component-host\\dist\\vue\\z-bench-button.js',
      relative: 'vue/z-bench-button.js',
    },
  ]

  it('finds hashed assets without confusing button and shadow button chunks', () => {
    expect(
      findTreeShakingFile(files, {
        dir: 'assets',
        tag: 'bench-button',
      })?.relative,
    ).toBe('assets/bench-button--DcrAJUv.js')

    expect(
      findTreeShakingFile(files, {
        dir: 'assets',
        tag: 'bench-button-shadow',
      })?.relative,
    ).toBe('assets/bench-button-shadow-Dqmo7yYl.js')
  })

  it('finds wrapper facade files by exact relative path', () => {
    expect(
      findTreeShakingFile(files, {
        dir: 'react',
        tag: 'z-bench-button',
      })?.relative,
    ).toBe('react/z-bench-button.js')

    expect(
      findTreeShakingFile(files, {
        dir: 'vue',
        tag: 'z-bench-button',
      })?.relative,
    ).toBe('vue/z-bench-button.js')
  })
})
