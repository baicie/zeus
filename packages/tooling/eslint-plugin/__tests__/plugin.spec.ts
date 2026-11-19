import { describe, expect, it } from 'vitest'

import plugin, { rules } from '../src'

describe('@zeus-js/eslint-plugin', () => {
  it('publishes a flat recommended config that references this plugin', () => {
    expect(plugin.meta.name).toBe('@zeus-js/eslint-plugin')
    expect(plugin.meta.version).toEqual(expect.any(String))
    expect(plugin.configs.recommended).toMatchObject({
      name: 'zeus/recommended',
      plugins: { zeus: plugin },
      rules: {
        'zeus/no-internal-imports': 'error',
        'zeus/valid-builtin-usage': 'error',
      },
    })
  })

  it('does not claim autofixes for ambiguous source changes', () => {
    for (const rule of Object.values(rules)) {
      expect(rule.meta?.fixable).toBeUndefined()
      expect(rule.meta?.hasSuggestions).not.toBe(true)
    }
  })
})
