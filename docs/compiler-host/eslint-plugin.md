# ESLint Plugin

`@zeus-js/eslint-plugin` provides rules for Zeus application and Web Component
sources. It is an ESLint plugin, not an LSP and not a replacement for compiler
diagnostics.

The initial compatibility contract is ESLint `^10.0.0` with
`typescript-eslint` `^8.61.1`; older ESLint major versions are not claimed.

## Installation

```bash
pnpm add -D eslint typescript-eslint @zeus-js/eslint-plugin
```

Add the flat config:

```js
import zeus from '@zeus-js/eslint-plugin'
import tseslint from 'typescript-eslint'

export default [
  tseslint.configs.base,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { zeus },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    rules: zeus.configs.recommended.rules,
  },
]
```

## Rules

| Rule                       | Detects                                                                                                           | Autofix |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------- |
| `zeus/no-internal-imports` | Imports from package `internal`, `src` or `dist` entries                                                          | None    |
| `zeus/valid-builtin-usage` | Missing `Show.when`, missing `For.each`, non-function `For` children, misplaced `Host`, and `Slot` outside `Host` | None    |

`@zeus-js/signal/diagnostics` remains importable because it is a documented
diagnostics entry, not an internal implementation entry.

The rules intentionally provide no fixes in the initial release. A source entry
import may have no equivalent public export, while restructuring JSX can alter
ownership, cleanup, and component execution. The packed consumer gate runs the
candidate tarball with `--fix` and verifies that invalid sources remain
unchanged.

## Boundary

ESLint validates local syntax and placement. The Rust compiler remains
authoritative for lowering, source maps, and structured `ZEUS_*` diagnostics.
Editor metadata comes from `custom-elements.json` and `vscode.html-custom-data.json`
as described in [Web Component Output](./output-wc.md). No Zeus LSP is implemented
or implied.
