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

  it('compiles dynamic text in raw text elements without markers', async () => {
    const code = `
      const App = (props: { color: string }) => (
        <style>{\`.count { color: \${props.color}; }\`}</style>
      )
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

  it('compiles element ref with state', async () => {
    const code = `
      const App = () => {
        const input = state<HTMLInputElement | null>(null)
        return <input ref={input} />
      }
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles element ref with callback', async () => {
    const code = `
      const App = () => {
        const onMount = (el: HTMLDivElement) => { console.log(el) }
        return <div ref={onMount} />
      }
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles element ref with object current', async () => {
    const code = `
      const App = () => {
        const el = { current: null as HTMLDivElement | null }
        return <div ref={el} />
      }
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('errors on string ref', async () => {
    const code = `
      const App = () => <div ref="id" />
    `

    await expect(compile(code)).rejects.toThrow()
  })

  it('errors on empty ref', async () => {
    const code = `
      const App = () => <div ref={} />
    `

    await expect(compile(code)).rejects.toThrow()
  })

  it('compiles dynamic class, style, attr, prop, event', async () => {
    const code = `
      const App = () => {
        const user = state({ name: 'Zeus', active: true, width: 100 })
        return (
          <input
            class={{ active: user.active }}
            style={{ width: user.width }}
            title={user.name}
            prop:value={user.name}
            onInput={e => (user.name = e.currentTarget.value)}
          />
        )
      }
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('wraps member expression event handlers to preserve receiver', async () => {
    const code = `
      const App = () => {
        const theme = state({
          mode: 'light',
          toggle() {
            this.mode = this.mode === 'light' ? 'dark' : 'light'
          },
        })

        return <button onClick={theme.toggle}>Toggle</button>
      }
    `

    expect(await compile(code)).toContain(
      '_bindEvent(_el$, "click", _event$ => theme.toggle(_event$));',
    )
  })

  it('wraps optional member expression event handlers with optional call', async () => {
    const code = `
      const App = () => {
        const maybe = state<{ toggle?: (e: Event) => void } | undefined>(undefined)
        return <button onClick={maybe?.toggle}>Toggle</button>
      }
    `

    expect(await compile(code)).toContain(
      '_bindEvent(_el$, "click", _event$ => maybe?.toggle?.(_event$));',
    )
  })

  it('normalizes static className to class in template', async () => {
    const code = `
      const App = () => <div className="box">hello</div>
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles dynamic className as bindClass', async () => {
    const code = `
      const App = (props: { className: string }) => <div className={props.className} />
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles Show with fallback', async () => {
    const code = `
      import { Show } from '@zeus-js/runtime-dom'
      const App = (props: { visible: boolean }) => (
        <div>
          <Show when={props.visible} fallback={<span>hidden</span>}>
            <span>visible</span>
          </Show>
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles For', async () => {
    const code = `
      import { For } from '@zeus-js/runtime-dom'
      const App = (props: { items: string[] }) => (
        <ul>
          <For each={props.items}>
            {(item, index) => <li>{index}: {item}</li>}
          </For>
        </ul>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles dynamic component props as getters', async () => {
    const code = `
      function Title(props: { name: string }) {
        return <h1>{props.name}</h1>
      }

      const App = () => {
        const user = state({ name: 'Zeus' })
        return <Title name={user.name} />
      }
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles Slot to createSlot', async () => {
    const code = `
      import { Host, Slot } from '@zeus-js/runtime-dom'

      const App = () => (
        <Host>
          <article>
            <Slot />
            <Slot name="footer">
              <button>fallback</button>
            </Slot>
          </article>
        </Host>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles Host as no-op wrapper', async () => {
    const code = `
      import { Host } from '@zeus-js/runtime-dom'

      const App = () => (
        <Host>
          <div>hello</div>
        </Host>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('declares element variable when domPath is FirstChild', async () => {
    const code = `
      const App = (props: { name: string }) => (
        <div>
          <span>{props.name}</span>
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('declares element variable when domPath is Child with dynamic content before static', async () => {
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

  it('declares element variable when domPath is Child with multiple dynamics before static', async () => {
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

  it('declares element variable when static elements surround dynamic child', async () => {
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

  it('declares element variable for deeply nested FirstChild', async () => {
    const code = `
      const App = (props: { name: string }) => (
        <div>
          <section>
            <span>{props.name}</span>
          </section>
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles counter with static card structure around dynamic content', async () => {
    const code = `
      function Counter() {
        const count = state(0)
        return (
          <div class="card">
            <h1>Counter</h1>
            <div class="count">{count.value}</div>
            <div class="buttons">
              <button onClick={() => count.value--}>-</button>
              <button onClick={() => count.value++}>+</button>
            </div>
          </div>
        )
      }
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles static text node before dynamic text', async () => {
    const code = `
      const App = (props: { name: string }) => (
        <div>
          hello {props.name}
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })

  it('compiles continuous dynamic nodes with anchors declared before insert', async () => {
    const code = `
      const App = (props: { a: string; b: string; c: string }) => (
        <div>
          {props.a}
          {props.b}
          {props.c}
        </div>
      )
    `

    expect(await compile(code)).toMatchSnapshot()
  })
})
