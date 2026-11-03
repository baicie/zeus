# Diagnostics and Editor Layers

Zeus reports failures at the layer that owns the rule. Compiler codes and
ESLint rule IDs are both visible to users but have different authority.

| Layer                         | Stable identifier                                                                                                             | Authority                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Rust/native/WASM compiler     | `ZEUS_PARSE_ERROR`, `ZEUS_SEMANTIC_ERROR`, `ZEUS_INVALID_BUILTIN_USAGE`, `ZEUS_INVALID_HOST_USAGE`, `ZEUS_INVALID_SLOT_USAGE` | Final TSX lowering and source-span diagnostics                |
| Vite transform                | The original `ZEUS_*` compiler code through the error overlay                                                                 | Surfaces compiler results without rewriting their meaning     |
| SSR lowering                  | `ZEUS_UNSUPPORTED_SSR_PROPERTY`, `ZEUS_SSR_ERROR_BOUNDARY_UNSUPPORTED`                                                        | Server code generation boundary                               |
| Web Component analysis/output | `ZEUS_WC_*`, `ZEUS_VSCODE_CUSTOM_DATA_INVALID`                                                                                | Manifest, ABI, form, slot, wrapper, and editor-data contracts |
| Output plugin host            | `ZEUS_PLUGIN_API_VERSION`, `ZEUS_OUTPUT_CONFIG`, `ZEUS_OUTPUT_CONFLICT`                                                       | Third-party plugin compatibility and file ownership           |
| RFC-019 HMR runtime           | `ZEUS_HMR_PATCH_FAILED`, `ZEUS_HMR_PLAN_MISMATCH`, `ZEUS_HMR_STALE_PATCH`                                                     | Development invalidation/reload decisions                     |
| ESLint                        | `zeus/no-internal-imports`, `zeus/valid-builtin-usage`                                                                        | Early local feedback; never a replacement for compiler errors |

## Common fixes

| Symptom                                              | Action                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ZEUS_INVALID_HOST_USAGE`                            | Use `<Host>` as the root returned by a `defineElement` setup function; see [Host and Slot](./host-slot.md).    |
| `ZEUS_INVALID_SLOT_USAGE` / `ZEUS_INVALID_SLOT_NAME` | Place `<Slot>` below `<Host>` and use a valid static slot name.                                                |
| `ZEUS_UNSUPPORTED_SSR_PROPERTY`                      | Use a supported property/event form or move the client-only interaction behind an explicit component boundary. |
| `ZEUS_WC_DUPLICATE_TAG`                              | Keep one component declaration for each custom-element tag.                                                    |
| `ZEUS_HMR_*`                                         | Repair the reported compiler/runtime mismatch; the page falls back to a full reload after rollback.            |
| `zeus/no-internal-imports`                           | Import from a documented package export such as `@zeus-js/zeus` or `@zeus-js/output-wc`.                       |

## Framework and editor ownership

- TSX types come from `@zeus-js/zeus/jsx` and generated Web Component `jsx.d.ts`.
- React 18/19 and Vue 3 wrappers consume generated declarations; their TypeScript
  errors remain TypeScript diagnostics rather than new Zeus runtime codes.
- `custom-elements.json` is the source for tag/attribute editor metadata and the
  full events/methods/slots record.
- `vscode.html-custom-data.json` supports HTML tags, attributes, and literal
  values. Zeus does not present it, ESLint, or a future LSP as a trusted runtime
  sandbox.

There is no separately versioned FAQ diagnostic namespace. These pages and the
structured compiler result are the canonical explanations; FAQ text must not
invent codes that are absent from the producing layer.
