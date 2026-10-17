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
  "schemaVersion": 1,
  "components": [
    {
      "tag": "z-button",
      "name": "ZButton",
      "exportName": "ZButton",
      "source": "src/components/button.tsx",
      "description": "Button with variants and sizes",
      "props": {
        "variant": {
          "type": "string",
          "default": "default",
          "values": ["default", "outline", "ghost", "destructive"],
          "reflect": true,
          "attr": "variant",
          "hasDefault": true,
          "defaultStrategy": "static"
        },
        "disabled": {
          "type": "boolean",
          "default": false,
          "reflect": true,
          "hasDefault": true,
          "defaultStrategy": "static"
        }
      },
      "events": {
        "press": {
          "key": "press",
          "name": "press",
          "reactName": "onPress",
          "detail": { "nativeEvent": "MouseEvent" },
          "bubbles": true,
          "composed": true,
          "cancelable": false
        }
      },
      "slots": {
        "default": { "name": "default", "description": "Button label content" }
      },
      "cssParts": ["button"],
      "cssVars": {
        "--button-padding": { "name": "--button-padding" },
        "--button-radius": { "name": "--button-radius" }
      }
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
