import { noInternalImports, validBuiltinUsage } from './rules'

import type { Rule } from 'eslint'

const version = __VERSION__ as string
export type ZeusRuleName = 'no-internal-imports' | 'valid-builtin-usage'
export const rules: Record<ZeusRuleName, Rule.RuleModule> = {
  'no-internal-imports': noInternalImports,
  'valid-builtin-usage': validBuiltinUsage,
}

type ConfiguredRuleName =
  | 'zeus/no-internal-imports'
  | 'zeus/valid-builtin-usage'

interface ZeusEslintPlugin {
  meta: {
    name: string
    version: string
  }
  rules: typeof rules
  configs: {
    recommended?: {
      name: string
      plugins: { zeus: ZeusEslintPlugin }
      rules: Record<ConfiguredRuleName, 'error'>
    }
  }
}

export const plugin = {
  meta: {
    name: '@zeus-js/eslint-plugin',
    version,
  },
  rules,
  configs: {},
} as ZeusEslintPlugin

plugin.configs.recommended = {
  name: 'zeus/recommended',
  plugins: { zeus: plugin },
  rules: {
    'zeus/no-internal-imports': 'error',
    'zeus/valid-builtin-usage': 'error',
  },
}

export { noInternalImports, validBuiltinUsage }
export default plugin
