import { transformAsync } from '@babel/core'
import { describe, expect, it } from 'vitest'

import zeus from '../src'

async function compile(code: string) {
  const result = await transformAsync(code, {
    filename: 'test.tsx',
    plugins: [zeus],
    parserOpts: {
      plugins: ['typescript', 'jsx'],
    },
    generatorOpts: {
      retainLines: false,
      compact: false,
      jsescOption: {
        minimal: true,
      },
    },
  })

  return result?.code?.trim()
}

describe('zeus compiler jsx transform', () => {
  it('compiles static element', async () => {
    const code = `
      const App = () => <div>hello</div>
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles dynamic text child', async () => {
    const code = `
      const App = (props: { name: string }) => <div>{props.name}</div>
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles static element before dynamic child', async () => {
    const code = `
      const App = (props: { name: string }) => (
        <div>
          <span />
          {props.name}
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles dynamic child before static element', async () => {
    const code = `
      const App = (props: { name: string }) => (
        <div>
          {props.name}
          <span />
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles multiple dynamic children before static element', async () => {
    const code = `
      const App = (props: { first: string; second: string }) => (
        <div>
          {props.first}
          {props.second}
          <span />
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles static elements around dynamic child', async () => {
    const code = `
      const App = (props: { name: string }) => (
        <div>
          <span />
          {props.name}
          <b />
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles component usage', async () => {
    const code = `
      function MyComponent(props: { title: string }) {
        return <h1>{props.title}</h1>
      }

      const App = () => <MyComponent title="hello" />
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles nested component usage', async () => {
    const code = `
      import { Show } from '@zeus-js/runtime-dom'

      interface Props {
        title: string
        count?: number
      }

      export function MyComponent(props: Props) {
        return (
          <div className="component">
            <h1>{props.title}</h1>
            <Show when={props.count !== undefined}>
              <span>Count: {props.count}</span>
            </Show>
          </div>
        )
      }

      export function ParentComponent() {
        return (
          <div>
            <MyComponent title="Hello" />
            <MyComponent title="World" count={5} />
          </div>
        )
      }
    `

    expect(await compile(code)).toMatchSnapshot()
  })
})
