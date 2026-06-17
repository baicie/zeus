import { transformAsync } from '@babel/core'
import { describe, expect, it } from 'vitest'

import zeusRaw from '../src'
const zeus = zeusRaw as unknown as (api: object, opts: object) => object

async function compile(code: string) {
  const result = await transformAsync(code, {
    filename: 'host.fixture.tsx',
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

describe('Host transform', () => {
  it('transforms Host with host attributes', async () => {
    const code = await compile(`
      import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

      export const ZButton = defineElement(
        'z-button',
        { shadow: false },
        props => {
          return (
            <Host
              data-state={props.open ? 'open' : 'closed'}
              data-slot="button"
              class={['z-button', props.open && 'is-open']}
            >
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

  it('transforms Host style object', async () => {
    const code = await compile(`
      import { defineElement, Host } from '@zeus-js/runtime-dom'

      export const ZBox = defineElement(
        'z-box',
        { shadow: false },
        props => {
          return (
            <Host
              style={{
                display: 'block',
                opacity: props.active ? 1 : 0.5,
              }}
            >
              <span>box</span>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms Host with aria attributes', async () => {
    const code = await compile(`
      import { defineElement, Host } from '@zeus-js/runtime-dom'

      export const ZDialog = defineElement(
        'z-dialog',
        { shadow: false },
        props => {
          return (
            <Host
              role="dialog"
              aria-modal="true"
              aria-label={props.label}
            >
              <div>dialog content</div>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('transforms Host with className and id', async () => {
    const code = await compile(`
      import { defineElement, Host } from '@zeus-js/runtime-dom'

      export const ZCard = defineElement(
        'z-card',
        { shadow: false },
        () => {
          return (
            <Host
              id="main-card"
              className="z-card"
              data-variant="outline"
            >
              <section>content</section>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchSnapshot()
  })

  it('passes Host getter props through without double wrapping', async () => {
    const code = await compile(`
      import { defineElement, Host } from '@zeus-js/runtime-dom'

      export const ZButton = defineElement(
        'z-button',
        { shadow: false },
        props => {
          return (
            <Host
              data-variant={() => props.variant}
              data-disabled={() => props.disabled ? '' : undefined}
            >
              <button>button</button>
            </Host>
          )
        },
      )
    `)

    expect(code).toContain('"data-variant": () => props.variant')
    expect(code).toContain(
      '"data-disabled": () => props.disabled ? \'\' : undefined',
    )
    expect(code).not.toContain('"data-variant": () => () => props.variant')
  })
})
