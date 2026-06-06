import { transformAsync } from '@babel/core'
import { describe, expect, it } from 'vitest'

import zeus from '../src'

async function compile(code: string) {
  const result = await transformAsync(code, {
    filename: 'fixture.tsx',
    plugins: [zeus],
    parserOpts: {
      plugins: ['typescript', 'jsx'],
    },
    generatorOpts: {
      compact: false,
      retainLines: false,
      jsescOption: {
        minimal: true,
      },
    },
  })

  if (!result?.code) {
    throw new Error('Transform failed')
  }

  return result.code.trim()
}

describe('compiler web component transform', () => {
  it('transforms defineElement with default Slot wrapped in Host', async () => {
    const code = await compile(`
      import { defineElement, event, Host, Slot } from '@zeus-js/runtime-dom'

      export const ZCard = defineElement(
        'z-card',
        {
          shadow: false,
          emits: { press: event<{ value: boolean }>() },
        },
        () => {
          return (
            <Host>
              <section>
                <Slot />
              </section>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms named Slot wrapped in Host', async () => {
    const code = await compile(`
      import { defineElement, event, Host, Slot } from '@zeus-js/runtime-dom'

      export const ZCard = defineElement(
        'z-card',
        { shadow: false },
        () => {
          return (
            <Host>
              <section>
                <header>
                  <Slot name="header" />
                </header>
                <main>
                  <Slot />
                </main>
              </section>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms Host with Slot', async () => {
    const code = await compile(`
      import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

      export const ZButton = defineElement(
        'z-button',
        { shadow: false },
        props => {
          return (
            <Host>
              <button>
                <Slot />
              </button>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms event emit in setup', async () => {
    const code = await compile(`
      import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

      export const ZButton = defineElement(
        'z-button',
        { shadow: false },
        (props, { emit }) => {
          return (
            <Host>
              <button
                onClick={() => emit.press({ value: true })}
              >
                <Slot />
              </button>
            </Host>
          )
        },
      )
    `)

    expect(code).toContain('emit')
    expect(code).toMatchSnapshot()
  })

  it('transforms continuous dynamic text in web component setup', async () => {
    const code = await compile(`
      import { defineElement } from '@zeus-js/runtime-dom'

      export const ZText = defineElement(
        'z-text',
        { shadow: false },
        props => {
          return (
            <span>
              {props.a}
              {props.b}
              {props.c}
            </span>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms Slot fallback wrapped in Host', async () => {
    const code = await compile(`
      import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

      export const ZEmpty = defineElement(
        'z-empty',
        { shadow: false },
        () => {
          return (
            <Host>
              <Slot>
                <span>fallback</span>
              </Slot>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms defineElement with shadow mode', async () => {
    const code = await compile(`
      import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

      export const ZCard = defineElement(
        'z-card',
        { shadow: true },
        () => {
          return (
            <Host>
              <section>
                <Slot />
              </section>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms defineElement with props and emit', async () => {
    const code = await compile(`
      import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

      export const ZCounter = defineElement<{ count?: number }>(
        'z-counter',
        {
          shadow: false,
          emits: {
            change: event<{ count: number }>(),
          },
          props: {
            count: Number,
          },
        },
        (props, { emit }) => {
          return (
            <Host>
              <button onClick={() => emit.change({ count: (props.count ?? 0) + 1 })}>
                <Slot />
                {props.count}
              </button>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms defineElement with styles', async () => {
    const code = await compile(`
      import { defineElement } from '@zeus-js/runtime-dom'

      export const ZBox = defineElement(
        'z-box',
        {
          shadow: true,
          styles: ':host { display: block; }',
        },
        () => {
          return <div>content</div>
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms defineElement with Host and styles', async () => {
    const code = await compile(`
      import { defineElement, Host } from '@zeus-js/runtime-dom'

      export const ZCard = defineElement(
        'z-card',
        {
          shadow: true,
          styles: 'section { padding: 1rem; }',
        },
        () => {
          return (
            <Host>
              <section>card content</section>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms defineElement with multiple named slots', async () => {
    const code = await compile(`
      import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

      export const ZLayout = defineElement(
        'z-layout',
        { shadow: false },
        () => {
          return (
            <Host>
              <header><Slot name="header">Default Header</Slot></header>
              <main><Slot /></main>
              <footer><Slot name="footer" /></footer>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })
})
