import { describe, expect, it } from 'vitest'

import { VirtualModuleRegistry, normalizeVirtualId } from '../src/virtual'

describe('VirtualModuleRegistry', () => {
  describe('set and get', () => {
    it('stores and retrieves module code', () => {
      const registry = new VirtualModuleRegistry()
      registry.set('zeus:wc:index', 'export const x = 1;')

      expect(registry.get('zeus:wc:index')).toBe('export const x = 1;')
    })

    it('returns undefined for unknown modules', () => {
      const registry = new VirtualModuleRegistry()
      expect(registry.get('unknown')).toBeUndefined()
    })
  })

  describe('has', () => {
    it('returns true for stored modules', () => {
      const registry = new VirtualModuleRegistry()
      registry.set('zeus:virtual', 'code')

      expect(registry.has('zeus:virtual')).toBe(true)
    })

    it('returns false for unknown modules', () => {
      const registry = new VirtualModuleRegistry()
      expect(registry.has('unknown')).toBe(false)
    })
  })

  describe('clear', () => {
    it('removes all modules', () => {
      const registry = new VirtualModuleRegistry()
      registry.set('a', 'code a')
      registry.set('b', 'code b')
      registry.clear()

      expect(registry.has('a')).toBe(false)
      expect(registry.has('b')).toBe(false)
    })
  })

  describe('resolve', () => {
    it('returns null for unknown modules', () => {
      const registry = new VirtualModuleRegistry()
      expect(registry.resolve('unknown')).toBeNull()
    })

    it('returns prefixed id for known modules', () => {
      const registry = new VirtualModuleRegistry()
      registry.set('zeus:module', 'code')

      const resolved = registry.resolve('zeus:module')
      expect(resolved).toBeTruthy()
      expect(resolved!.startsWith('\0')).toBe(true)
    })
  })

  describe('load', () => {
    it('returns null for non-prefixed ids', () => {
      const registry = new VirtualModuleRegistry()
      expect(registry.load('zeus:module')).toBeNull()
    })

    it('returns code for prefixed ids', () => {
      const registry = new VirtualModuleRegistry()
      registry.set('zeus:module', 'export const x = 1;')

      const resolved = registry.resolve('zeus:module')
      expect(resolved).toBeTruthy()
      expect(registry.load(resolved!)).toBe('export const x = 1;')
    })
  })

  describe('normalizeVirtualId', () => {
    it('removes prefix', () => {
      expect(normalizeVirtualId('\0zeus:module')).toBe('zeus:module')
    })

    it('keeps normal ids unchanged', () => {
      expect(normalizeVirtualId('zeus:module')).toBe('zeus:module')
    })
  })
})
