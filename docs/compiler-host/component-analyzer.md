# Component Analyzer

The component analyzer parses `defineElement` declarations and produces a `ComponentManifest`.

## Usage

```ts
import { analyzeComponents } from '@zeus-js/component-analyzer'

const manifest = await analyzeComponents({
  include: ['src/components/**/*.ts'],
})
```

## Output

```json
{
  "version": "1.0",
  "components": [
    {
      "tag": "z-button",
      "name": "ZButton",
      "props": {
        "variant": {
          "type": "String",
          "default": "default",
          "values": ["default", "outline", "ghost", "destructive"],
          "reflect": true
        },
        "disabled": {
          "type": "Boolean",
          "default": false,
          "reflect": true
        }
      },
      "events": {
        "press": {
          "detail": { "nativeEvent": "MouseEvent" },
          "bubbles": true,
          "composed": true
        }
      },
      "slots": {
        "": { "description": "Default slot content" }
      },
      "cssParts": ["button"],
      "cssVars": ["--button-padding", "--button-radius"]
    }
  ]
}
```

## Options

```ts
interface AnalyzeOptions {
  /** Glob patterns for source files */
  include: string | string[]

  /** Files to exclude */
  exclude?: string | string[]

  /** Base directory for resolution (default: process.cwd()) */
  root?: string
}
```

## Programmatic usage

```ts
import { analyzeComponents } from '@zeus-js/component-analyzer'

// With explicit root
const manifest = await analyzeComponents({
  include: ['src/components/**/*.{ts,tsx}'],
  root: './my-app',
})

// With result
const { manifest, diagnostics } = await analyzeComponents({
  include: ['src/components/**/*.{ts,tsx}'],
})

if (diagnostics.length > 0) {
  console.warn('Analysis warnings:', diagnostics)
}
```
