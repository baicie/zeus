# 测试结构规范

## 目录结构

```
packages/signal/__tests__/
  computed.spec.ts
  effect.spec.ts
  effectScope.spec.ts
  watch.spec.ts
  ref.spec.ts
  reactive.spec.ts
  readonly.spec.ts
  shallowReactive.spec.ts
  shallowReadonly.spec.ts
  reactiveArray.spec.ts
  gc.spec.ts

packages/runtime-dom/__tests__/
  render.spec.ts
  binding.spec.ts
  ref.spec.ts

packages/compiler/__tests__/
  jsx.spec.ts
  builtin.spec.ts
```

## 规范

- 测试文件使用 `.spec.ts` 后缀（Vitest 默认）
- 每个包有独立的 `__tests__/` 目录
- 测试按功能模块拆分，不要把所有测试写在一个文件里
- 基准测试放 `__benchmarks__/` 目录

## Phase 0 要求

Phase 0 不要求把所有测试写完，只需把目录和命名规范定好。当前 signal 包的结构已完全对齐此规范。
