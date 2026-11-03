# @zeus-js/eslint-plugin (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { Rule } from 'eslint'

export declare const noInternalImports: Rule.RuleModule
export declare const validBuiltinUsage: Rule.RuleModule

export type ZeusRuleName = 'no-internal-imports' | 'valid-builtin-usage'
export declare const rules: Record<ZeusRuleName, Rule.RuleModule>
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
      plugins: {
        zeus: ZeusEslintPlugin
      }
      rules: Record<ConfiguredRuleName, 'error'>
    }
  }
}
export declare const plugin: ZeusEslintPlugin

export { plugin as default }
```
