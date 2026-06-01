import { describe, expect, it } from 'vitest'

import { generateWCEntry } from '../src/generateEntry'

describe('generateEntry', () => {
  it('generates import and export for component', () => {
    const result = generateWCEntry({
      root: '/project',
      component: {
        tag: 'z-button',
        name: 'ZButton',
        exportName: 'ZButton',
        source: 'src/components/button.tsx',
        props: {},
        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
    })

    expect(result).toContain(
      `import { ZButton } from "/project/src/components/button.tsx";`,
    )
    expect(result).toContain('export { ZButton };')
  })

  it('uses exportName for both import and export', () => {
    const result = generateWCEntry({
      root: '/project',
      component: {
        tag: 'z-icon',
        name: 'ZIcon',
        exportName: 'ZIcon',
        source: 'src/icon.tsx',
        props: {},
        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
    })

    expect(result).toContain('import { ZIcon }')
    expect(result).toContain('export { ZIcon }')
  })

  it('normalizes source path (backslashes)', () => {
    const result = generateWCEntry({
      root: 'C:\\project',
      component: {
        tag: 'z-button',
        name: 'ZButton',
        exportName: 'ZButton',
        source: 'src\\components\\button.tsx',
        props: {},
        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
    })

    expect(result).not.toContain('\\')
    expect(result).toContain('import { ZButton } from')
  })

  it('handles deep source paths', () => {
    const result = generateWCEntry({
      root: '/project',
      component: {
        tag: 'z-card-header-title',
        name: 'ZCardHeaderTitle',
        exportName: 'ZCardHeaderTitle',
        source: 'src/ui/card/header/title.tsx',
        props: {},
        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
    })

    expect(result).toContain('import { ZCardHeaderTitle }')
    expect(result).toContain('/project/src/ui/card/header/title.tsx')
  })
})
