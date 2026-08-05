import * as runtime from '@zeus-js/runtime-ssr'
import { describe, expect, it } from 'vitest'

import { createZeus } from '../src'

import type { HookHandler, Plugin } from 'vite'

type TransformHook = NonNullable<HookHandler<Plugin['transform']>>

const runtimeGlobal = '__ZEUS_SSR_EXECUTION_RUNTIME__'
const source = `
  const Item = props => (
    <li data-index={props.index}>{props.name}</li>
  )

  export const App = props => (
    <main
      title={() => props.title}
      class={() => ['app', { visible: props.visible }]}
      style={() => ({ lineHeight: 2 })}
      onClick={() => {}}
    >
      <input prop:value={() => props.title} />
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
    const executable = code.replace(
      '"@zeus-js/runtime-ssr"',
      JSON.stringify(runtimeURL),
    )
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
        runtime.renderToString(() =>
          module.App({
            title: 'people "now" & later',
            visible: true,
            items: ['<Ada>', 'Lin'],
            script: 'const less = 1 < 2; const close = "</script>";',
            css: '@media (width < 10px) { body::before { content: "</style>"; } }',
          }),
        ),
      ).toBe(
        '<main title="people &quot;now&quot; &amp; later" class="app visible" style="line-height:2"><input value="people &quot;now&quot; &amp; later"><script>const less = 1 < 2; const close = "\\u003C/script>";</script><style>@media (width < 10px) { body::before { content: "\\3C /style>"; } }</style><ul><li data-index="0">&lt;Ada&gt;</li><li data-index="1">Lin</li></ul></main>',
      )

      expect(
        runtime.renderToString(() =>
          module.App({
            title: 'empty',
            visible: false,
            items: [],
            script: '',
            css: '',
          }),
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
})

async function compileSSR(code: string): Promise<string> {
  const plugin = createZeus()
  const hook = plugin.transform
  if (!hook) throw new Error('Expected transform hook')
  const handler: TransformHook =
    typeof hook === 'function' ? hook : hook.handler
  const result = await handler.call(
    {} as ThisParameterType<TransformHook>,
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
  ] as const
  const code = helpers
    .map(
      name =>
        `export const ${name} = (...args) => globalThis.${runtimeGlobal}.${name}(...args)`,
    )
    .join('\n')
  return toDataURL(code)
}

function toDataURL(code: string): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}
