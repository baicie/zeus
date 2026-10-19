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

  it('preserves state for comment-only edits', () => {
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const App = () => <div>hello</div>\n// before',
        'const App = () => <div>hello</div>\n// after',
      ),
    ).toEqual({
      kind: 'comment-only',
      strategy: 'preserve-state',
      preserveState: true,
    })
  })

  it('does not preserve state for JSX whitespace or string contents', () => {
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const App = () => <div>hello world</div>\n// note',
        'const App = () => <div>helloworld</div>\n// note',
      ),
    ).toMatchObject({
      kind: 'template-structure',
      strategy: 'dispose-remount',
      preserveState: false,
    })
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const value = "// before"\n// note',
        'const value = "// after"\n// note',
      ),
    ).toMatchObject({
      strategy: 'dispose-remount',
      preserveState: false,
    })
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const pattern = /https?:\\/\\/example.test/\n// note',
        'const pattern = /https?:\\/\\/example.test/\n// changed',
      ),
    ).toMatchObject({
      strategy: 'dispose-remount',
      preserveState: false,
    })
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const App = () => <div>/*before*/</div>',
        'const App = () => <div>/*after*/</div>',
      ),
    ).toMatchObject({
      strategy: 'dispose-remount',
      preserveState: false,
    })
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const App = () => <div>//before</div>',
        'const App = () => <div>//after</div>',
      ),
    ).toMatchObject({
      strategy: 'dispose-remount',
      preserveState: false,
    })
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const value = 1 /* before',
        'const value = 1 /* after',
      ),
    ).toMatchObject({
      strategy: 'dispose-remount',
      preserveState: false,
    })
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const App = () => <div>/*before*/</div>\n// note',
        'const App = () => <div>/*after*/</div>\n// note',
      ),
    ).toMatchObject({
      strategy: 'dispose-remount',
      preserveState: false,
    })
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const App = () => <div>//before</div>\n// note',
        'const App = () => <div>//after</div>\n// note',
      ),
    ).toMatchObject({
      strategy: 'dispose-remount',
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
