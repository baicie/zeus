import { describe, expect, it } from 'vitest'

import {
  generateWCIndex,
  getVirtualComponentId,
  getVirtualIndexId,
} from '../src/generateIndex'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = any

describe('generateIndex', () => {
  describe('generateWCIndex', () => {
    it('exports from virtual module id for each component', () => {
      const result = generateWCIndex({
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      expect(result).toContain('export * from "zeus:wc:z-button";')
    })

    it('exports from virtual module id for multiple components', () => {
      const result = generateWCIndex({
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
          {
            tag: 'z-card',
            name: 'ZCard',
            exportName: 'ZCard',
            source: 'src/card.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      expect(result).toContain('export * from "zeus:wc:z-button";')
      expect(result).toContain('export * from "zeus:wc:z-card";')
    })

    it('handles empty components array', () => {
      const result = generateWCIndex({ components: [] })
      expect(result).toBe('')
    })

    it('ends with trailing newline', () => {
      const result = generateWCIndex({
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      expect(result.endsWith('\n')).toBe(true)
    })
  })

  describe('getVirtualComponentId', () => {
    it('generates virtual id with zeus:wc: prefix', () => {
      const component: AnyComponent = { tag: 'z-button' }
      expect(getVirtualComponentId(component)).toBe('zeus:wc:z-button')
    })

    it('handles kebab-case tags', () => {
      const component: AnyComponent = { tag: 'z-card-header' }
      expect(getVirtualComponentId(component)).toBe('zeus:wc:z-card-header')
    })
  })

  describe('getVirtualIndexId', () => {
    it('returns zeus:wc:index', () => {
      expect(getVirtualIndexId()).toBe('zeus:wc:index')
    })
  })
})
