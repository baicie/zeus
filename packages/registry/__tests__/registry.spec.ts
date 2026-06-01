import { describe, expect, it } from 'vitest'

import { getRegistryItem, listRegistryItems } from '../src'

describe('registry', () => {
  describe('getRegistryItem', () => {
    it('returns react button', () => {
      const item = getRegistryItem('react', 'button')

      expect(item?.name).toBe('button')
      expect(item?.framework).toBe('react')
      expect(item?.files[0].path).toBe('src/components/ui/button.tsx')
    })

    it('returns vue button', () => {
      const item = getRegistryItem('vue', 'button')

      expect(item?.name).toBe('button')
      expect(item?.framework).toBe('vue')
      expect(item?.files[0].path).toBe('src/components/ui/Button.vue')
    })

    it('returns react switch', () => {
      const item = getRegistryItem('react', 'switch')

      expect(item?.name).toBe('switch')
      expect(item?.framework).toBe('react')
    })

    it('returns react dialog', () => {
      const item = getRegistryItem('react', 'dialog')

      expect(item?.name).toBe('dialog')
      expect(item?.framework).toBe('react')
      expect(item?.files[0].path).toBe('src/components/ui/dialog.tsx')
    })

    it('returns undefined for unknown component', () => {
      const item = getRegistryItem('react', 'unknown')
      expect(item).toBeUndefined()
    })

    it('returns undefined for framework mismatch', () => {
      const item = getRegistryItem('vue', 'checkbox')
      expect(item).toBeUndefined()
    })
  })

  describe('listRegistryItems', () => {
    it('returns all items when no framework specified', () => {
      const items = listRegistryItems()
      expect(items.length).toBeGreaterThan(0)
    })

    it('returns only react items', () => {
      const items = listRegistryItems('react')
      expect(items.every(item => item.framework === 'react')).toBe(true)
    })

    it('returns only vue items', () => {
      const items = listRegistryItems('vue')
      expect(items.every(item => item.framework === 'vue')).toBe(true)
    })

    it('includes dependencies in react button', () => {
      const item = getRegistryItem('react', 'button')
      expect(item?.dependencies).toBeDefined()
      expect(
        item?.dependencies!.some(d => d.name === '@zeus-ui/headless'),
      ).toBe(true)
    })

    it('includes registryDependencies in react button', () => {
      const item = getRegistryItem('react', 'button')
      expect(item?.registryDependencies).toContain('utils')
      expect(item?.registryDependencies).toContain('theme')
    })
  })
})
