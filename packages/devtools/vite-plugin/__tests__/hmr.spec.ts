import { describe, expect, it } from 'vitest'

import { classifyHmrUpdate } from '../src/hmr'

describe('vite-plugin-zeus HMR classification', () => {
  it('delegates stylesheet updates to Vite CSS HMR', () => {
    expect(classifyHmrUpdate('/src/app.css', undefined, 'body {}')).toEqual({
      kind: 'style-only',
      strategy: 'vite-style',
      preserveState: false,
    })
  })

  it.each([
    ['template structure', '<div />', '<button />', 'template-structure'],
    [
      'signal initialization',
      'createSignal(0)',
      'createSignal(1)',
      'signal-initialization',
    ],
    [
      'component API',
      "defineElement('x-old', {})",
      "defineElement('x-new', {})",
      'component-api',
    ],
  ])('%s uses a full dispose-remount', (_label, previous, next, kind) => {
    expect(classifyHmrUpdate('/src/App.tsx', previous, next)).toMatchObject({
      kind,
      strategy: 'dispose-remount',
      preserveState: false,
    })
  })

  it('keeps unknown updates conservative', () => {
    expect(
      classifyHmrUpdate('/src/App.tsx', 'const value = 1', 'const value = 2'),
    ).toEqual({
      kind: 'unknown',
      strategy: 'dispose-remount',
      preserveState: false,
    })
  })
})
