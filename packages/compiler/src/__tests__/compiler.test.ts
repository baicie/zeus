import { createDOMCompiler } from '../babel-plugin'
import { transformSync } from '@babel/core'

describe('Zeus JSX Compiler', () => {
  const compiler = createDOMCompiler({
    moduleName: '@zeus-js/runtime-dom',
    optimizeTemplates: true,
  })

  function transform(code: string) {
    return transformSync(code, {
      filename: 'test.jsx',
      presets: [],
      plugins: [compiler],
      parserOpts: {
        plugins: ['jsx', 'typescript'],
      },
      ast: false,
      sourceMaps: true,
      configFile: false,
      babelrc: false,
    })
  }

  test('should transform simple JSX element', () => {
    const code = `
      function App() {
        return <div>Hello World</div>;
      }
    `

    const result = transform(code)
    expect(result?.code).toBeDefined()
    expect(result?.code).toContain('createElement')
  })

  test('should transform JSX with dynamic content', () => {
    const code = `
      function App() {
        const name = 'Zeus';
        return <div>Hello {name}</div>;
      }
    `

    const result = transform(code)
    expect(result?.code).toBeDefined()
    expect(result?.code).toContain('name')
  })

  test('should transform JSX with event handlers', () => {
    const code = `
      function App() {
        return <button onClick={() => console.log('clicked')}>Click me</button>;
      }
    `

    const result = transform(code)
    expect(result?.code).toBeDefined()
    expect(result?.code).toContain('onClick')
  })

  test('should transform JSX with conditional rendering', () => {
    const code = `
      function App() {
        const isVisible = true;
        return <div className={isVisible ? 'visible' : 'hidden'}>Content</div>;
      }
    `

    const result = transform(code)
    expect(result?.code).toBeDefined()
    expect(result?.code).toContain('isVisible')
  })

  test('should transform JSX Fragment', () => {
    const code = `
      function App() {
        return (
          <>
            <div>First</div>
            <div>Second</div>
          </>
        );
      }
    `

    const result = transform(code)
    expect(result?.code).toBeDefined()
    expect(result?.code).toContain('createDocumentFragment')
  })

  test('should handle custom elements', () => {
    const compiler = createDOMCompiler({
      moduleName: '@zeus-js/runtime-dom',
      isCustomElement: tag => tag.includes('-'),
    })

    const code = `
      function App() {
        return <my-custom-element>Content</my-custom-element>;
      }
    `

    const result = transformSync(code, {
      filename: 'test.jsx',
      presets: [],
      plugins: [compiler],
      parserOpts: {
        plugins: ['jsx', 'typescript'],
      },
      ast: false,
      sourceMaps: true,
      configFile: false,
      babelrc: false,
    })

    expect(result?.code).toBeDefined()
  })
})
