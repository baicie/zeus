import { describe, expect, it } from 'vitest'

import { createFilter, normalizePatterns, cleanUrl } from '../src/filter'

describe('filter', () => {
  describe('normalizePatterns', () => {
    it('wraps single RegExp in array', () => {
      const result = normalizePatterns(/\.tsx$/)
      expect(result).toEqual([/\.tsx$/])
    })

    it('passes through array unchanged', () => {
      const result = normalizePatterns([/\.tsx$/, /\.ts$/])
      expect(result).toEqual([/\.tsx$/, /\.ts$/])
    })
  })

  describe('createFilter', () => {
    it('includes tsx files by default', () => {
      const filter = createFilter()
      expect(filter('component.tsx')).toBe(true)
      expect(filter('component.tsx?v=1')).toBe(true)
    })

    it('includes ts files by default', () => {
      const filter = createFilter()
      expect(filter('component.tsx')).toBe(true)
      expect(filter('component.tsx?v=1')).toBe(true)
      expect(filter('component.jsx')).toBe(true)
    })

    it('excludes node_modules by default', () => {
      const filter = createFilter()
      expect(filter('node_modules/package/index.js')).toBe(false)
    })

    it('excludes node_modules with query params', () => {
      const filter = createFilter()
      expect(filter('node_modules/package/index.js?x=1')).toBe(false)
    })

    it('respects custom include patterns', () => {
      const filter = createFilter({
        include: /\.component\.tsx$/,
      })

      expect(filter('Button.component.tsx')).toBe(true)
      expect(filter('Button.tsx')).toBe(false)
    })

    it('respects custom exclude patterns', () => {
      const filter = createFilter({
        exclude: /stories\.tsx$/,
      })

      expect(filter('Button.tsx')).toBe(true)
      expect(filter('Button.stories.tsx')).toBe(false)
    })

    it('strips query params before matching', () => {
      const filter = createFilter({
        include: /\.tsx$/,
      })

      expect(filter('Button.tsx?v=123&lang=ts')).toBe(true)
    })

    it('strips hash before matching', () => {
      const filter = createFilter({
        include: /\.tsx$/,
      })

      expect(filter('Button.tsx#heading')).toBe(true)
    })

    it('combines multiple include patterns with OR', () => {
      const filter = createFilter({
        include: [/\.tsx$/, /\.jsx$/],
      })

      expect(filter('Button.tsx')).toBe(true)
      expect(filter('Button.jsx')).toBe(true)
      expect(filter('Button.js')).toBe(false)
    })
  })

  describe('cleanUrl', () => {
    it('strips query string', () => {
      expect(cleanUrl('file.tsx?v=123')).toBe('file.tsx')
    })

    it('strips hash', () => {
      expect(cleanUrl('file.tsx#section')).toBe('file.tsx')
    })

    it('strips both query and hash', () => {
      expect(cleanUrl('file.tsx?v=1#section')).toBe('file.tsx')
    })

    it('keeps clean URLs unchanged', () => {
      expect(cleanUrl('file.tsx')).toBe('file.tsx')
    })

    it('handles URLs with only hash', () => {
      expect(cleanUrl('file.tsx#')).toBe('file.tsx')
    })
  })
})
