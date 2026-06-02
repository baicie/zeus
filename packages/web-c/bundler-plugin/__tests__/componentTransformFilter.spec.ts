import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createComponentTransformFilter } from '../src/componentTransformFilter'

describe('componentTransformFilter', () => {
  const root = path.resolve('/project')

  it('matches files within component include pattern', () => {
    const shouldTransform = createComponentTransformFilter({
      root,
      include: ['src/components/**/*.{ts,tsx}'],
      exclude: ['src/shared/**', '**/*.test.*'],
    })

    expect(
      shouldTransform(path.resolve(root, 'src/components/button.tsx')),
    ).toBe(true)

    expect(
      shouldTransform(path.resolve(root, 'src/components/icon/index.ts')),
    ).toBe(true)

    expect(
      shouldTransform(path.resolve(root, 'src/components/dialog/dialog.tsx')),
    ).toBe(true)
  })

  it('excludes non-component files outside include pattern', () => {
    const shouldTransform = createComponentTransformFilter({
      root,
      include: ['src/components/**/*.{ts,tsx}'],
      exclude: ['src/shared/**', '**/*.test.*'],
    })

    expect(shouldTransform(path.resolve(root, 'src/App.tsx'))).toBe(false)

    expect(shouldTransform(path.resolve(root, 'src/pages/home.tsx'))).toBe(
      false,
    )

    expect(shouldTransform(path.resolve(root, 'src/utils/helper.ts'))).toBe(
      false,
    )
  })

  it('excludes files matching exclude pattern', () => {
    const shouldTransform = createComponentTransformFilter({
      root,
      include: ['src/components/**/*.{ts,tsx}'],
      exclude: ['src/shared/**', '**/*.test.*'],
    })

    expect(shouldTransform(path.resolve(root, 'src/shared/utils.ts'))).toBe(
      false,
    )

    expect(
      shouldTransform(path.resolve(root, 'src/components/button.test.tsx')),
    ).toBe(false)

    expect(
      shouldTransform(path.resolve(root, 'src/components/icon.test.ts')),
    ).toBe(false)
  })

  it('rejects files outside root directory', () => {
    const shouldTransform = createComponentTransformFilter({
      root,
      include: ['src/components/**/*.{ts,tsx}'],
      exclude: [],
    })

    expect(
      shouldTransform(path.resolve(root, '../other-project/button.tsx')),
    ).toBe(false)

    expect(shouldTransform(path.resolve('/usr/local/lib/button.tsx'))).toBe(
      false,
    )
  })

  it('strips query string and hash before matching', () => {
    const shouldTransform = createComponentTransformFilter({
      root,
      include: ['src/components/**/*.{ts,tsx}'],
      exclude: [],
    })

    expect(
      shouldTransform(path.resolve(root, 'src/components/button.tsx?v=123')),
    ).toBe(true)

    expect(
      shouldTransform(path.resolve(root, 'src/components/button.tsx#heading')),
    ).toBe(true)

    expect(
      shouldTransform(
        path.resolve(root, 'src/components/button.tsx?lang=ts#section'),
      ),
    ).toBe(true)
  })

  it('handles node_modules files outside root', () => {
    const shouldTransform = createComponentTransformFilter({
      root,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [],
    })

    expect(
      shouldTransform(path.resolve(root, 'node_modules/some-lib/index.ts')),
    ).toBe(false)
  })

  it('normalizes windows backslashes to forward slashes', () => {
    const shouldTransform = createComponentTransformFilter({
      root,
      include: ['src/components/**/*.{ts,tsx}'],
      exclude: [],
    })

    expect(
      shouldTransform(path.resolve(root, 'src\\components\\button.tsx')),
    ).toBe(true)
  })
})
