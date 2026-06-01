import { describe, expect, it } from 'vitest'

import {
  getComponentFileBaseName,
  getComponentFileName,
  sanitizeFileName,
} from '../src/naming'

describe('naming', () => {
  describe('getComponentFileBaseName', () => {
    it('returns tag as-is by default', () => {
      expect(getComponentFileBaseName('z-button', {})).toBe('z-button')
      expect(getComponentFileBaseName('my-element', {})).toBe('my-element')
    })

    it('strips configured prefix', () => {
      expect(getComponentFileBaseName('z-button', { stripPrefix: 'z-' })).toBe(
        'button',
      )
      expect(getComponentFileBaseName('x-btn', { stripPrefix: 'x-' })).toBe(
        'btn',
      )
    })

    it('does not strip prefix when tag does not start with it', () => {
      expect(getComponentFileBaseName('button', { stripPrefix: 'z-' })).toBe(
        'button',
      )
    })

    it('does not strip prefix when stripPrefix is false', () => {
      expect(getComponentFileBaseName('z-button', { stripPrefix: false })).toBe(
        'z-button',
      )
    })

    it('fileName function takes priority over stripPrefix', () => {
      const opts = {
        stripPrefix: 'z-',
        fileName: (tag: string) => `custom-${tag}`,
      }
      expect(getComponentFileBaseName('z-button', opts)).toBe('custom-z-button')
    })

    it('fileName function strips .js suffix', () => {
      const opts = { fileName: (tag: string) => `${tag}.js` }
      expect(getComponentFileBaseName('z-button', opts)).toBe('z-button')
    })

    it('sanitizes fileName output', () => {
      const opts = { fileName: () => '  z button!@#  ' }
      expect(getComponentFileBaseName('z-button', opts)).toBe('z-button')
    })

    it('sanitizes tag output', () => {
      expect(getComponentFileBaseName('z-button!@#', {})).toBe('z-button')
      expect(getComponentFileBaseName('  z-button  ', {})).toBe('z-button')
      expect(getComponentFileBaseName('a--b--c', {})).toBe('a-b-c')
    })
  })

  describe('getComponentFileName', () => {
    it('appends .js extension', () => {
      expect(getComponentFileName('z-button', {})).toBe('z-button.js')
    })

    it('applies naming rules from getComponentFileBaseName', () => {
      expect(getComponentFileName('z-button', { stripPrefix: 'z-' })).toBe(
        'button.js',
      )
    })
  })

  describe('sanitizeFileName', () => {
    it('trims whitespace', () => {
      expect(sanitizeFileName('  tag  ')).toBe('tag')
    })

    it('replaces invalid characters with hyphens', () => {
      expect(sanitizeFileName('z-button!@#')).toBe('z-button')
      expect(sanitizeFileName('my.element')).toBe('my.element')
    })

    it('collapses multiple hyphens', () => {
      expect(sanitizeFileName('a--b')).toBe('a-b')
      expect(sanitizeFileName('a---b---c')).toBe('a-b-c')
    })

    it('removes leading and trailing hyphens', () => {
      expect(sanitizeFileName('-tag-')).toBe('tag')
      expect(sanitizeFileName('--tag--')).toBe('tag')
    })

    it('preserves valid characters', () => {
      expect(sanitizeFileName('my-component_v2.0')).toBe('my-component_v2.0')
    })
  })
})
