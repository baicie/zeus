import { describe, expect, it } from 'vitest'

import { createOutputRegistry } from '../src/outputRegistry'

describe('createOutputRegistry', () => {
  it('provides stable defaults for every output kind', () => {
    const registry = createOutputRegistry()

    for (const kind of [
      'wc',
      'react',
      'vue',
      'icons-react',
      'icons-vue',
      'icons-wc',
      'asset',
    ] as const) {
      registry.register(kind, {})
    }

    expect(registry.getDir('wc')).toBe('wc')
    expect(registry.getDir('react')).toBe('react')
    expect(registry.getDir('vue')).toBe('vue')
    expect(registry.getDir('icons-react')).toBe('icons/react')
    expect(registry.getDir('icons-vue')).toBe('icons/vue')
    expect(registry.getDir('icons-wc')).toBe('icons/wc')
    expect(registry.getDir('asset')).toBe('')
  })

  it('normalizes component filenames and joins output paths', () => {
    const registry = createOutputRegistry()

    registry.register('wc', { outDir: 'dist/components', stripPrefix: 'z-' })

    expect(registry.has('wc')).toBe(true)
    expect(registry.getFileName('wc', 'z-button')).toBe('button.js')
    expect(registry.join('wc', registry.getFileName('wc', 'z-button'))).toBe(
      'dist/components/button.js',
    )
  })

  it('uses a custom filename function with the output kind', () => {
    const registry = createOutputRegistry()
    const tags: string[] = []

    registry.register('react', {
      outDir: 'wrappers',
      fileName(tag, kind) {
        tags.push(`${kind}:${tag}`)
        return `${tag}.tsx`
      },
    })

    expect(registry.getFileName('react', 'z-button')).toBe('z-button.tsx')
    expect(tags).toEqual(['react:z-button'])
  })

  it('diagnoses conflicting and missing output kinds', () => {
    const registry = createOutputRegistry()

    registry.register('wc', { outDir: 'first' })

    expect(() => registry.register('wc', { outDir: 'second' })).toThrow(
      '[ZEUS_OUTPUT_CONFLICT] output kind "wc" is registered by more than one output plugin.',
    )
    expect(registry.getDir('wc')).toBe('first')
    expect(() => registry.getDir('vue')).toThrow(
      '[zeus] output kind "vue" is not registered.',
    )
  })
})
