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

  it.each(['\n', '\r', '\r\n', '\u2028', '\u2029'])(
    'remounts when a block comment introduces a %j line terminator',
    lineTerminator => {
      const previous = 'function read() { return /* before */ 1 }'
      const next = `function read() { return /* after${lineTerminator} */ 1 }`

      expect(Function(`${previous}; return read()`)()).toBe(1)
      expect(Function(`${next}; return read()`)()).toBeUndefined()
      expect(classifyHmrUpdate('/src/App.tsx', previous, next)).toMatchObject({
        strategy: 'dispose-remount',
        preserveState: false,
      })
      expect(classifyHmrUpdate('/src/App.tsx', next, previous)).toMatchObject({
        strategy: 'dispose-remount',
        preserveState: false,
      })
    },
  )

  it('preserves ordinary block comment edits with unchanged line terminators', () => {
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'function read() { return /* before\n comment */ 1 }',
        'function read() { return /* after\n comment */ 1 }',
      ),
    ).toMatchObject({
      strategy: 'preserve-state',
      preserveState: true,
    })
  })

  it.each(['\r', '\u2028', '\u2029'])(
    'does not swallow executable code after a %j line comment terminator',
    lineTerminator => {
      const previous = `let value = 1 // before${lineTerminator}value = 2`
      const next = `let value = 1 // after${lineTerminator}value = 3`

      expect(Function(`${previous}; return value`)()).toBe(2)
      expect(Function(`${next}; return value`)()).toBe(3)
      expect(classifyHmrUpdate('/src/App.tsx', previous, next)).toMatchObject({
        strategy: 'dispose-remount',
        preserveState: false,
      })
    },
  )

  it.each([
    '@once',
    '@jsxImportSource other-runtime',
    '@jsxRuntime classic',
    '#__PURE__',
    '@__NO_SIDE_EFFECTS__',
    '@vite-ignore',
    'webpackChunkName: "changed"',
    'sourceMappingURL=changed.map',
  ])('recompiles changes to the %s compiler directive', directive => {
    const previous = 'const App = () => <div>{/* note */ count()}</div>'
    const next = `const App = () => <div>{/* ${directive} */ count()}</div>`

    for (const [before, after] of [
      [previous, next],
      [next, previous],
    ]) {
      expect(classifyHmrUpdate('/src/App.tsx', before, after)).toMatchObject({
        strategy: 'dispose-remount',
        preserveState: false,
      })
    }
  })

  it('recompiles line comment directives', () => {
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        '// note\nconst App = () => <div />',
        '// @jsxImportSource other-runtime\nconst App = () => <div />',
      ),
    ).toMatchObject({
      strategy: 'dispose-remount',
      preserveState: false,
    })
  })

  it('remounts when a nested template contains changed comment-like text', () => {
    const previous = 'const value = `outer ${`/* before */`}`'
    const next = 'const value = `outer ${`/* after */`}`'

    expect(Function(`${previous}; return value`)()).toBe('outer /* before */')
    expect(Function(`${next}; return value`)()).toBe('outer /* after */')
    expect(classifyHmrUpdate('/src/App.tsx', previous, next)).toMatchObject({
      strategy: 'dispose-remount',
      preserveState: false,
    })
  })

  it('preserves ordinary comment edits without altering template contents', () => {
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const value = `hello`\n// before',
        'const value = `hello`\n// after',
      ),
    ).toMatchObject({
      strategy: 'preserve-state',
      preserveState: true,
    })
  })

  it('remounts changed JSX text inside a nested expression', () => {
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const App = () => <div>{true ? <span>/* before */</span> : null}</div>',
        'const App = () => <div>{true ? <span>/* after */</span> : null}</div>',
      ),
    ).toMatchObject({
      strategy: 'dispose-remount',
      preserveState: false,
    })
  })

  it.each([
    'const value = `outer ${`literal /* text */`}`',
    'const App = () => <div>{true ? <span>/* text */</span> : null}</div>',
    'const pattern = /https?:\\/\\/example.test/',
    'const value: number = 1',
  ])('preserves actual comment edits after %s', source => {
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        `${source}\n// before`,
        `${source}\n// after`,
      ),
    ).toMatchObject({
      strategy: 'preserve-state',
      preserveState: true,
    })
  })

  it('does not preserve malformed syntax that only differs in comments', () => {
    expect(
      classifyHmrUpdate(
        '/src/App.tsx',
        'const value = ( // before',
        'const value = ( // after',
      ),
    ).toMatchObject({
      strategy: 'dispose-remount',
      preserveState: false,
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
        'const pattern = /https?:\\/\\/changed.test/\n// changed',
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
