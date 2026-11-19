import * as runtime from '@zeus-js/runtime-ssr'
import { describe, expect, it } from 'vitest'

import { createZeus } from '../src'

import type { HookHandler, Plugin } from 'vite'

type TransformHook = NonNullable<HookHandler<Plugin['transform']>>

const runtimeGlobal = '__ZEUS_SSR_EXECUTION_RUNTIME__'
const stripHydrationMarkers = (html: string): string =>
  html.replace(/<!--zeus:hydrate:[^>]+-->/g, '')
const source = `
  import { For, Show } from '@zeus-js/runtime-dom'

  const Item = props => (
    <li data-index={props.index}>{props.name}</li>
  )

  export const App = props => (
    <main
      title={props.title}
      class={['app', { visible: props.visible }]}
      style={{ lineHeight: 2 }}
      onClick={() => {}}
    >
      <input prop:value={props.title} />
      <script>{props.script}</script>
      <style>{props.css}</style>
      <Show when={props.visible} fallback={<p>empty</p>}>
        <ul>
          <For each={props.items}>
            {(item, index) => <Item name={item} index={index} />}
          </For>
        </ul>
      </Show>
    </main>
  )
`

describe('vite-plugin-zeus SSR execution', () => {
  it('executes compiled components with the real SSR runtime in Node', async () => {
    const code = await compileSSR(source)
    const runtimeURL = createRuntimeProxyURL()
    const executable = code
      .replace(/"@zeus-js\/runtime-ssr"/g, JSON.stringify(runtimeURL))
      .replace(/'@zeus-js\/runtime-dom'/g, JSON.stringify(runtimeURL))
    const globalState = globalThis as typeof globalThis & {
      [runtimeGlobal]?: typeof runtime
    }
    globalState[runtimeGlobal] = runtime

    try {
      const module = (await import(toDataURL(executable))) as {
        App(props: {
          title: string
          visible: boolean
          items: string[]
          script: string
          css: string
        }): runtime.SSRNode
      }

      expect(
        stripHydrationMarkers(
          runtime.renderToString(() =>
            module.App({
              title: 'people "now" & later',
              visible: true,
              items: ['<Ada>', 'Lin'],
              script: 'const less = 1 < 2; const close = "</script>";',
              css: '@media (width < 10px) { body::before { content: "</style>"; } }',
            }),
          ),
        ),
      ).toBe(
        '<main title="people &quot;now&quot; &amp; later" class="app visible" style="line-height:2"><input value="people &quot;now&quot; &amp; later"><script>const less = 1 < 2; const close = "\\u003C/script>";</script><style>@media (width < 10px) { body::before { content: "\\3C /style>"; } }</style><ul><li data-index="0">&lt;Ada&gt;</li><li data-index="1">Lin</li></ul></main>',
      )

      expect(
        stripHydrationMarkers(
          runtime.renderToString(() =>
            module.App({
              title: 'empty',
              visible: false,
              items: [],
              script: '',
              css: '',
            }),
          ),
        ),
      ).toBe(
        '<main title="empty" class="app" style="line-height:2"><input value="empty"><script></script><style></style><p>empty</p></main>',
      )
      expect(code).not.toMatch(/\b(?:document|window|Node)\b/)
      expect(code).not.toContain('onClick')
    } finally {
      delete globalState[runtimeGlobal]
    }
  })

  it('executes compiled custom-element definitions into first-paint DSD', async () => {
    const source = `
      import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

      export const Field = defineElement(
        'z-field',
        {
          shadow: true,
          formAssociated: true,
          styles: '.field { color: red }',
          props: {
            value: { type: String, default: 'Seed', reflect: true },
          },
        },
        props => (
          <Host role="group">
            <label><Slot name="label">Name</Slot></label>
            <input prop:value={props.value} onInput={() => {}} />
          </Host>
        ),
      )

      export const App = () => (
        <Field value="Server"><span slot="label">Email</span></Field>
      )
    `
    const code = await compileSSR(source)
    const runtimeURL = createRuntimeProxyURL()
    const executable = code
      .replace(/"@zeus-js\/runtime-ssr"/g, JSON.stringify(runtimeURL))
      .replace(/'@zeus-js\/runtime-dom'/g, JSON.stringify(runtimeURL))
    const globalState = globalThis as typeof globalThis & {
      [runtimeGlobal]?: typeof runtime
    }
    globalState[runtimeGlobal] = runtime

    try {
      const module = (await import(toDataURL(executable))) as {
        App(): runtime.SSRNode
      }
      expect(
        stripHydrationMarkers(runtime.renderToString(() => module.App())),
      ).toBe(
        '<z-field value="Server" role="group"><template shadowrootmode="open"><style>.field { color: red }</style><label><slot name="label">Name</slot></label><input value="Server"></template><span slot="label">Email</span></z-field>',
      )
      expect(code).toContain('defineElement as $zeusSsrDefineElement')
      expect(code).toContain('Host as $zeusSsrHost')
      expect(code).toContain('Slot as $zeusSsrSlot')
      expect(code).not.toMatch(
        /\b(?:document|window|HTMLElement|customElements)\b/,
      )
    } finally {
      delete globalState[runtimeGlobal]
    }
  })

  it('uses generated Manifest metadata for compiled first-paint Web Component HTML', async () => {
    const source = `
      import { ssrComponentFromManifest } from '@zeus-js/runtime-ssr'

      export const App = () => ssrComponentFromManifest(
        {
          schemaVersion: 1,
          components: [{
            tag: 'z-manifest-field',
            props: {
              value: { type: 'string', default: 'Seed', reflect: true },
              model: { type: 'object', attr: false },
            },
            meta: {
              shadow: true,
              formAssociated: true,
            },
          }],
        },
        'z-manifest-field',
        { value: 'Ada', model: { id: 1 } },
        props => <input value={props.value} />,
      )
    `
    const code = await compileSSR(source)
    const runtimeURL = createRuntimeProxyURL()
    const executable = code
      .replace(/"@zeus-js\/runtime-ssr"/g, JSON.stringify(runtimeURL))
      .replace(/'@zeus-js\/runtime-ssr'/g, JSON.stringify(runtimeURL))
    const globalState = globalThis as typeof globalThis & {
      [runtimeGlobal]?: typeof runtime
    }
    globalState[runtimeGlobal] = runtime

    try {
      const module = (await import(toDataURL(executable))) as {
        App(): runtime.SSRNode
      }
      expect(
        stripHydrationMarkers(runtime.renderToString(() => module.App())),
      ).toBe(
        '<z-manifest-field value="Ada"><template shadowrootmode="open"><input value="Ada"></template></z-manifest-field>',
      )
      expect(code).toContain('ssrComponentFromManifest')
      expect(code).not.toMatch(
        /\b(?:document|window|HTMLElement|customElements)\b/,
      )
    } finally {
      delete globalState[runtimeGlobal]
    }
  })
})

async function compileSSR(code: string): Promise<string> {
  const plugin = createZeus()
  const hook = plugin.transform
  if (!hook) throw new Error('Expected transform hook')
  const handler: TransformHook =
    typeof hook === 'function' ? hook : hook.handler
  const result = await handler.call(
    {
      error(error: Error | string | { message: string }) {
        throw error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : error.message)
      },
    } as ThisParameterType<TransformHook>,
    code,
    '/src/App.tsx',
    { moduleType: 'tsx', ssr: true },
  )

  if (
    !result ||
    typeof result === 'string' ||
    typeof result.code !== 'string'
  ) {
    throw new Error('Expected SSR transform result')
  }
  return result.code
}

function createRuntimeProxyURL(): string {
  const helpers = [
    'ssrStatic',
    'ssrText',
    'ssrAttr',
    'ssrProp',
    'ssrElement',
    'ssrComponent',
    'ssrShow',
    'ssrFor',
    'ssrSpread',
    'mergeProps',
    'ssrHydrationMarker',
    'ssrComponentFromManifest',
    'defineElement',
    'Host',
    'Slot',
  ] as const
  const code =
    helpers
      .map(
        name =>
          `export const ${name} = (...args) => globalThis.${runtimeGlobal}.${name}(...args)`,
      )
      .join('\n') +
    '\nexport const Show = Symbol("Show")\nexport const For = Symbol("For")'
  return toDataURL(code)
}

function toDataURL(code: string): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}
