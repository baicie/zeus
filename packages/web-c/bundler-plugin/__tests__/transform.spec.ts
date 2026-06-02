import { describe, expect, it } from 'vitest'

import { transformZeus } from '../src/transform'

describe('transformZeus', () => {
  it('transforms Zeus JSX', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        export function App() {
          return <div>Hello {name}</div>
        }
      `,
    })

    expect(result?.code).toContain('@zeus-js/runtime-dom')
  })

  it('supports custom runtime moduleName', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        export function App() {
          return <div>Hello</div>
        }
      `,
      compiler: {
        moduleName: 'custom-runtime',
      },
    })

    expect(result?.code).toContain('custom-runtime')
  })

  it('transforms Show component', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        import { Show } from '@zeus-js/runtime-dom'
        export function App(props: { visible: boolean }) {
          return <Show when={props.visible}><span>hi</span></Show>
        }
      `,
    })

    expect(result?.code).toContain('_createComponent')
  })

  it('transforms For component', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        import { For } from '@zeus-js/runtime-dom'
        export function App(props: { items: string[] }) {
          return <For each={props.items}>{(item) => <li>{item}</li>}</For>
        }
      `,
    })

    expect(result?.code).toContain('_For')
  })

  it('transforms event binding', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        export function App() {
          return <button onClick={() => {}}>click</button>
        }
      `,
    })

    expect(result?.code).toContain('_bindEvent')
  })

  it('transforms attribute binding', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        export function App(props: { title: string }) {
          return <div title={props.title} />
        }
      `,
    })

    expect(result?.code).toContain('_bindAttr')
  })

  it('transforms text binding', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        export function App(props: { name: string }) {
          return <div>{props.name}</div>
        }
      `,
    })

    expect(result?.code).toContain('_bindText')
  })

  it('transforms class binding', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        export function App(props: { active: boolean }) {
          return <div class={{ active: props.active }} />
        }
      `,
    })

    expect(result?.code).toContain('_bindClass')
  })

  it('transforms style binding', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        export function App() {
          return <div style={{ color: 'red' }} />
        }
      `,
    })

    expect(result?.code).toContain('_bindStyle')
  })

  it('transforms ref binding', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        export function App(props: { input: HTMLInputElement | null }) {
          return <input ref={props.input} />
        }
      `,
    })

    expect(result?.code).toContain('_bindRef')
  })

  it('transforms js files', async () => {
    const result = await transformZeus({
      id: 'fixture.js',
      code: `export const x = 1`,
    })

    expect(result?.code).toBeTruthy()
  })

  it('returns sourcemap by default', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `export function App() { return <div>hi</div> }`,
    })

    expect(result?.map).not.toBeNull()
  })

  it('skips sourcemap when disabled', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `export function App() { return <div>hi</div> }`,
      sourcemap: false,
    })

    expect(result?.map).toBeNull()
  })
})
