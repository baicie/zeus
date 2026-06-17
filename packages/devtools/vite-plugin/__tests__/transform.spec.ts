import { transformAsync } from '@babel/core'
import zeusCompilerRaw from '@zeus-js/compiler'
import { describe, expect, it } from 'vitest'

const zeusCompiler = zeusCompilerRaw as unknown as (
  api: object,
  opts: object,
) => object

async function compile(code: string, id = 'test.tsx') {
  const result = await transformAsync(code, {
    filename: id,
    plugins: [
      [
        zeusCompiler,
        {
          moduleName: '@zeus-js/runtime-dom',
          generate: 'dom',
          hydratable: false,
          delegateEvents: false,
        },
      ],
    ],
    parserOpts: {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    },
  })
  return result?.code ?? null
}

describe('vite-plugin-zeus (compiler integration)', () => {
  it('transforms tsx files', async () => {
    const code = await compile(`const App = () => <div>hello</div>`)

    expect(code).toBeTruthy()
    expect(code).toContain('_template')
  })

  it('transforms dynamic text', async () => {
    const code = await compile(
      `const App = (props: { name: string }) => <div>{props.name}</div>`,
    )

    expect(code).toBeTruthy()
    expect(code).toContain('_bindText')
  })

  it('transforms dynamic attr', async () => {
    const code = await compile(
      `const App = (props: { title: string }) => <div title={props.title} />`,
    )

    expect(code).toBeTruthy()
    expect(code).toContain('_bindAttr')
  })

  it('transforms Show', async () => {
    const code = await compile(
      `import { Show } from '@zeus-js/runtime-dom'
const App = (props: { visible: boolean }) => (
  <Show when={props.visible}><span>hi</span></Show>
)`,
    )

    expect(code).toBeTruthy()
    expect(code).toContain('_createComponent')
  })

  it('transforms For with mountFor', async () => {
    const code = await compile(
      `import { For } from '@zeus-js/runtime-dom'
const App = (props: { items: string[] }) => (
  <ul><For each={props.items}>{(item) => <li>{item}</li>}</For></ul>
)`,
    )

    expect(code).toBeTruthy()
    expect(code).toContain('_mountFor')
  })

  it('transforms bindClass and bindStyle', async () => {
    const code = await compile(
      `const App = (props: { active: boolean }) => (
  <div class={{ active: props.active }} style={{ color: 'red' }} />
)`,
    )

    expect(code).toBeTruthy()
    expect(code).toContain('_bindClass')
    expect(code).toContain('_bindStyle')
  })

  it('transforms bindEvent', async () => {
    const code = await compile(
      `const App = () => <button onClick={() => {}}>click</button>`,
    )

    expect(code).toBeTruthy()
    expect(code).toContain('_bindEvent')
  })

  it('transforms bindRef', async () => {
    const code = await compile(
      `const App = (props: { input: HTMLInputElement | null }) => (
  <input ref={props.input} />
)`,
    )

    expect(code).toBeTruthy()
    expect(code).toContain('_bindRef')
  })

  it('transforms createComponent with static props', async () => {
    const code = await compile(
      `import { Show } from '@zeus-js/runtime-dom'
const App = () => <Show when={true}><span>hi</span></Show>`,
    )

    expect(code).toBeTruthy()
    expect(code).toContain('_createComponent')
  })

  it('generates valid es module output', async () => {
    const code = await compile(`const App = () => <div>hello</div>`)

    expect(code).toBeTruthy()
    expect(code).toContain('import')
    expect(code).toContain('from "@zeus-js/runtime-dom"')
  })
})
