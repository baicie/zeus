import { transformAsync } from '@babel/core'
import { describe, expect, it } from 'vitest'

import zeusRaw from '../src'

import type { CompilerOptions } from '../src'

const zeus = zeusRaw as unknown as (api: object, opts: object) => object

async function compile(
  code: string,
  options: Partial<CompilerOptions> = {},
): Promise<string> {
  const result = await transformAsync(code, {
    filename: '/fixtures/ssr.fixture.tsx',
    plugins: [
      [
        zeus,
        {
          generate: 'ssr',
          ...options,
        },
      ],
    ],
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

  if (!result?.code) throw new Error('Transform failed')
  return result.code.trim()
}

describe('zeus compiler SSR codegen', () => {
  it('emits static and void elements through the SSR runtime only', async () => {
    const code = await compile(`
      const App = () => (
        <main id="app">
          Hello<br />
        </main>
      )
    `)

    expect(code).toContain('from "@zeus-js/runtime-ssr"')
    expect(code).toContain('_ssrElement("main"')
    expect(code).toContain('_ssrElement("br"')
    expect(code).not.toContain('@zeus-js/runtime-dom')
    expect(code).not.toContain('_template')
    expect(code).not.toMatch(/\b(?:document|window|Node)\b/)
  })

  it('isolates a custom SSR runtime module from later compilations', async () => {
    const source = 'const App = () => <div />'
    const custom = await compile(source, { moduleName: 'virtual:ssr-runtime' })
    const defaultAfterCustom = await compile(source)

    expect(custom).toContain('from "virtual:ssr-runtime"')
    expect(custom).not.toContain('@zeus-js/runtime-ssr')
    expect(defaultAfterCustom).toContain('from "@zeus-js/runtime-ssr"')
    expect(defaultAfterCustom).not.toContain('virtual:ssr-runtime')
  })

  it('routes dynamic text and attributes through escaping helpers', async () => {
    const code = await compile(`
      const App = (props: { name: string; title: string }) => (
        <article title={props.title}>Hello {props.name}</article>
      )
    `)

    expect(code).toContain('_ssrAttr("title", props.title)')
    expect(code).toContain('_ssrText(props.name)')
    expect(code).toContain('_ssrStatic("Hello")')
  })

  it('preserves script and style raw text through nested control flow', async () => {
    const code = await compile(`
      const App = (props: {
        script: string
        css: string
        fallback: string
        enabled: boolean
      }) => (
        <>
          <script>const amp = "a&b";{props.script}</script>
          <style>
            <Show when={props.enabled} fallback={props.fallback}>
              {props.css}
            </Show>
          </style>
        </>
      )
    `)

    expect(code).toContain('"const amp = \\"a&b\\";", props.script')
    expect(code).toContain(
      '_ssrShow(() => props.enabled, () => props.css, () => props.fallback)',
    )
    expect(code).not.toContain('_ssrText(props.script)')
    expect(code).not.toContain('_ssrText(props.css)')
  })

  it.each([
    ['Component', 'script', '<Child />'],
    ['Element', 'style', '<span />'],
  ])('rejects %s children inside <%s> raw text', async (kind, tag, child) => {
    await expect(
      compile(`
          const Child = () => <>child</>
          const App = () => <${tag}>${child}</${tag}>
        `),
    ).rejects.toMatchObject({
      name: 'ZeusCompilerError',
      code: 'ZEUS_UNSUPPORTED_SSR_RAW_TEXT_CHILD',
      diagnostic: {
        code: 'ZEUS_UNSUPPORTED_SSR_RAW_TEXT_CHILD',
        filename: '/fixtures/ssr.fixture.tsx',
        message: `${kind} children are not supported inside <${tag}> SSR raw text.`,
        span: expect.any(Object),
      },
    })
  })

  it('serializes class, style, and primitive properties while omitting event and ref bindings', async () => {
    const code = await compile(`
      const App = (props: {
        classValue: string | string[] | Record<string, boolean>
        styleValue: string | Record<string, string | number>
        value: string
        onInput: (event: InputEvent) => void
        inputRef: { current: HTMLInputElement | null }
      }) => (
        <input
          className={props.classValue}
          style={props.styleValue}
          prop:value={props.value}
          onInput={props.onInput}
          ref={props.inputRef}
        />
      )
    `)

    expect(code).toContain('_ssrAttr("class", props.classValue)')
    expect(code).toContain('_ssrAttr("style", props.styleValue)')
    expect(code).toContain('_ssrProp("value", props.value)')
    expect(code).toContain('], undefined, true)')
    expect(code).not.toContain('props.onInput)')
    expect(code).not.toContain('props.inputRef)')
    expect(code).not.toContain('delegateEvents')
  })

  it('accepts property bindings with an equivalent HTML representation', async () => {
    const code = await compile(`
      const App = (props: Record<string, unknown>) => <>
        <input
          prop:value={props.value}
          prop:checked={props.checked}
          prop:multiple={props.multiple}
          prop:disabled={props.disabled}
          prop:readOnly={props.readOnly}
          prop:tabIndex={props.tabIndex}
        />
        <option prop:value={props.value} prop:selected={props.selected} />
        <label prop:htmlFor={props.htmlFor} />
        <textarea prop:value={props.value} prop:readOnly={props.readOnly} />
      </>
    `)

    expect(code).toContain('_ssrProp("readOnly", props.readOnly)')
    expect(code).toContain('_ssrProp("tabIndex", props.tabIndex)')
    expect(code).toContain('_ssrProp("htmlFor", props.htmlFor)')
  })

  it.each([
    ['div', 'textContent'],
    ['select', 'value'],
    ['div', 'checked'],
  ])(
    'rejects <%s prop:%s> when SSR has no equivalent HTML representation',
    async (tag, property) => {
      await expect(
        compile(
          `const App = (value: unknown) => <${tag} prop:${property}={value} />`,
        ),
      ).rejects.toMatchObject({
        name: 'ZeusCompilerError',
        code: 'ZEUS_UNSUPPORTED_SSR_PROPERTY',
        diagnostic: {
          code: 'ZEUS_UNSUPPORTED_SSR_PROPERTY',
          filename: '/fixtures/ssr.fixture.tsx',
          message: `Property "${property}" on <${tag}> cannot be serialized by SSR codegen.`,
          span: expect.any(Object),
        },
      })
    },
  )

  it('omits static and bare event-like attributes', async () => {
    const code = await compile(`
      const App = () => (
        <button
          onClick="alert('unsafe')"
          onFocus
          ONMOUSEOVER="run()"
          ONKEYDOWN={() => alert('unsafe')}
        >
          click
        </button>
      )
    `)

    expect(code).not.toContain('_ssrAttr("onClick"')
    expect(code).not.toContain('_ssrAttr("onFocus"')
    expect(code).not.toContain('_ssrAttr("ONMOUSEOVER"')
    expect(code).not.toContain('alert')
    expect(code).not.toContain('run()')
  })

  it('emits components with lazy props and children plus explicit fragments', async () => {
    const code = await compile(`
      function Card(props: {
        kind: string
        title: string
        children: unknown
      }) {
        return <><h2>{props.title}</h2>{props.children}</>
      }

      const App = (props: { title: string; body: string }) => (
        <Card kind="notice" title={props.title}>
          <p>{props.body}</p>
        </Card>
      )
    `)

    expect(code).toContain('return [_ssrElement("h2"')
    expect(code).toContain('_ssrComponent(Card, {')
    expect(code).toContain('kind: "notice"')
    expect(code).toMatch(/get title\(\) \{\s+return props\.title;/)
    expect(code).toMatch(/get children\(\) \{\s+return _ssrElement\("p"/)
  })

  it('emits Show and For as lazy SSR control-flow calls', async () => {
    const code = await compile(`
      const App = (props: { visible: boolean; items: string[] }) => (
        <Show when={props.visible} fallback={<p>empty</p>}>
          <ul>
            <For each={props.items}>
              {(item, index) => <li data-index={index}>{item}</li>}
            </For>
          </ul>
        </Show>
      )
    `)

    expect(code).toContain('_ssrShow(() => props.visible, () =>')
    expect(code).toContain('_ssrFor(() => props.items, (item, index) =>')
    expect(code).toContain('_ssrAttr("data-index", index)')
    expect(code).toContain('_ssrText(item)')
    expect(code).toMatch(/, \(\) => _ssrElement\("p"/)
  })

  it.each(['Host', 'Slot'])(
    'rejects the Web Components-only <%s> built-in with an SSR diagnostic',
    async builtin => {
      await expect(
        compile(`const App = () => <${builtin} />`),
      ).rejects.toMatchObject({
        name: 'ZeusCompilerError',
        code: 'ZEUS_UNSUPPORTED_SSR_BUILTIN',
        diagnostic: {
          code: 'ZEUS_UNSUPPORTED_SSR_BUILTIN',
          filename: '/fixtures/ssr.fixture.tsx',
          message: `<${builtin}> is not supported by SSR codegen.`,
          span: expect.any(Object),
        },
      })
    },
  )
})
