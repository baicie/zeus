# Manifest

The `zeus.components.json` manifest is the machine-readable record of all analyzed components.

## Location

Generated at:

```
dist/zeus.components.json
```

## Schema

```json
{
  "version": "1.0",
  "generatedAt": "2026-06-01T12:00:00.000Z",
  "components": [
    {
      "tag": "z-button",
      "name": "ZButton",
      "file": "src/components/button.ts",
      "description": "Button with variants and sizes",
      "props": {
        "variant": {
          "type": "String",
          "default": "default",
          "values": ["default", "outline", "ghost", "destructive"],
          "reflect": true,
          "attribute": "variant"
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
        "": { "description": "Button label content" }
      },
      "cssParts": ["button"],
      "cssVars": ["--button-padding", "--button-radius"]
    }
  ]
}
```

## Usage

### Documentation

Feed the manifest to the component API doc generator:

```bash
tsx scripts/docs/generate-component-api.ts dist/zeus.components.json docs/components
```

### IDE tooling

IDE extensions can consume the manifest to provide autocomplete for custom element props and events.

### Custom outputs

Write your own output plugin that consumes the manifest:

```ts
import type { ComponentManifest } from '@zeus-js/component-analyzer'

function myCustomOutput(manifest: ComponentManifest) {
  for (const component of manifest.components) {
    // generate custom artifacts
  }
}
```
