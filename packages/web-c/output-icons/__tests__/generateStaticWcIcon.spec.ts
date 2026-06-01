import { describe, expect, it } from 'vitest'

import { generateStaticWcIcon } from '../src/generateStaticWcIcon'
import { parseSvg } from '../src/svg'

describe('generateStaticWcIcon', () => {
  it('generates static custom element without Zeus runtime', () => {
    const parsed = parseSvg(
      '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    )

    const code = generateStaticWcIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: parsed.viewBox,
      innerSvg: parsed.innerSvg,
    })

    expect(code).toContain('customElements.define')
    expect(code).toContain('class CheckIconElement extends HTMLElement')
    expect(code).not.toContain('@zeus-js')
    expect(code).not.toContain('defineElement')
  })

  it('uses observedAttributes for size and label', () => {
    const parsed = parseSvg(
      '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    )

    const code = generateStaticWcIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: parsed.viewBox,
      innerSvg: parsed.innerSvg,
    })

    expect(code).toContain("['size', 'label']")
  })

  it('has getter/setter for size and label properties', () => {
    const parsed = parseSvg(
      '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    )

    const code = generateStaticWcIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: parsed.viewBox,
      innerSvg: parsed.innerSvg,
    })

    expect(code).toContain('get size()')
    expect(code).toContain('set size(value)')
    expect(code).toContain('get label()')
    expect(code).toContain('set label(value)')
  })

  it('escapes HTML in render output', () => {
    const parsed = parseSvg(
      '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    )

    const code = generateStaticWcIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: parsed.viewBox,
      innerSvg: parsed.innerSvg,
    })

    expect(code).toContain('function escapeHtml')
    expect(code).toContain('&amp;')
    expect(code).toContain('&lt;')
    expect(code).toContain('&gt;')
  })
})
