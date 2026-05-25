import { transformAsync } from '@babel/core'
import * as t from '@babel/types'
import { describe, expect, it } from 'vitest'

import zeus from '../src'
import { elementIR, dynamicTextIR, ref } from '../src/ir/semanticBuilders'
import { assignDomPaths, formatDomPath } from '../src/passes'

async function compile(code: string) {
  const result = await transformAsync(code, {
    filename: 'test.tsx',
    plugins: [[zeus, { irPipeline: true }]],
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

describe('zeus compiler ir-first pipeline', () => {
  it('assigns DOM paths independently from lowering', () => {
    const span = elementIR({ ref: ref('_span$'), tagName: 'span' })
    const dynamic = dynamicTextIR(t.identifier('name'), ref('_text$'))
    const bold = elementIR({ ref: ref('_bold$'), tagName: 'b' })
    const root = elementIR({
      ref: ref('_root$'),
      tagName: 'div',
      children: [span, dynamic, bold],
    })

    assignDomPaths(root)

    expect(formatDomPath(root.domPath)).toBe('Root')
    expect(formatDomPath(span.domPath)).toBe('FirstChild(_root$)')
    expect(formatDomPath(dynamic.domPath)).toBe('Marker(_root$, 0)')
    expect(formatDomPath(bold.domPath)).toBe('Child(_root$, 2)')
  })

  it('compiles native element bindings through the IR-first feature flag', async () => {
    const code = `
      const App = (props: {
        name: string
        id: string
        onClick: () => void
      }) => (
        <div>
          <span />
          {props.name}
          <b id={props.id} onClick={props.onClick} />
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles component calls through the IR-first feature flag', async () => {
    const code = `
      function Title(props: { text: string }) {
        return <h1>{props.text}</h1>
      }

      const App = () => <Title text="hello" />
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles component children through the IR-first feature flag', async () => {
    const code = `
      import { Show } from '@zeus-js/runtime-dom'

      const App = (props: { ok: boolean; name: string }) => (
        <div>
          <Show when={props.ok}>
            <span>Hello {props.name}</span>
          </Show>
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles root fragments through the IR-first feature flag', async () => {
    const code = `
      const App = () => (
        <>
          <span>First</span>
          <span>Second</span>
        </>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })
})
