# @zeus-js/eslint-plugin

ESLint flat-config rules for Zeus application and Web Component sources.

```js
import zeus from '@zeus-js/eslint-plugin'
import tseslint from 'typescript-eslint'

export default [
  tseslint.configs.base,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { zeus },
    rules: zeus.configs.recommended.rules,
  },
]
```

Rules:

- `zeus/no-internal-imports` rejects package `internal`, `src`, and `dist`
  entry points that are not supported public contracts.
- `zeus/valid-builtin-usage` validates `Show`, `For`, `Host`, and `Slot`
  placement and required props.

The initial rules do not mark autofixes. A wrong import may not have an
equivalent public export, and changing JSX structure without application
context is unsafe.
