import { describe, expect, it } from 'vitest'

import { generateReactIcon } from '../src/generateReactIcon'
import { parseSvg } from '../src/svg'

describe('generateReactIcon', () => {
  it('generates no-runtime React icon', () => {
    const parsed = parseSvg(
      '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    )

    const code = generateReactIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: parsed.viewBox,
      innerSvg: parsed.innerSvg,
    })

    expect(code).toContain(`import React from 'react'`)
    expect(code).toContain('export const CheckIcon')
    expect(code).toContain('React.forwardRef')
    expect(code).not.toContain('@zeus-js')
    expect(code).not.toContain('defineElement')
  })

  it('sets fill none and correct attributes', () => {
    const code = generateReactIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: '0 0 24 24',
      innerSvg: '<path d="M20 6 9 17l-5-5"/>',
    })

    expect(code).toContain("fill: 'none'")
    expect(code).toContain('xmlns:')
  })

  it('uses dangerouslySetInnerHTML for SVG content', () => {
    const parsed = parseSvg(
      '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    )

    const code = generateReactIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: parsed.viewBox,
      innerSvg: parsed.innerSvg,
    })

    expect(code).toContain('dangerouslySetInnerHTML')
  })

  it('renders title when provided', () => {
    const code = generateReactIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: '0 0 24 24',
      innerSvg: '<path d="M20 6 9 17l-5-5"/>',
      title: 'Check',
    })

    expect(code).toContain("React.createElement('title', null, title)")
    expect(code).toContain("role: title ? 'img' : undefined")
  })
})
