# @zeus-js/runtime-dom

## 0.1.1-beta.11

### Patch Changes

- 2d2be5c: Skip redundant attribute writes and avoid re-serializing an unchanged style
  binding, so reactive bindings that re-run with identical values no longer pay
  a DOM write per element.
- Updated dependencies [e30bbfb]
  - @zeus-js/signal@0.1.1-beta.11
