import { describe, expect, it } from 'vitest'

import { generateVueIcon } from '../src/generateVueIcon'

describe('generateVueIcon', () => {
  it('generates no-runtime Vue icon', () => {
    const code = generateVueIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: '0 0 24 24',
      innerSvg: '<path d="M20 6 9 17l-5-5"/>',
    })

    expect(code).toContain(`import { defineComponent, h } from 'vue'`)
    expect(code).toContain('export const CheckIcon')
    expect(code).toContain('defineComponent')
    expect(code).not.toContain('@zeus-js')
    expect(code).not.toContain('defineElement')
  })

  it('uses innerHTML for SVG content when no slot', () => {
    const code = generateVueIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: '0 0 24 24',
      innerSvg: '<path d="M20 6 9 17l-5-5"/>',
    })

    expect(code).toContain('innerHTML')
  })

  it('renders title when provided', () => {
    const code = generateVueIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: '0 0 24 24',
      innerSvg: '<path d="M20 6 9 17l-5-5"/>',
      title: 'Check',
    })

    expect(code).toContain("role: props.title ? 'img' : undefined")
  })
})
