# PR-22：DevTools stale target GC 验收

状态：PASS。仓库 `baicie/zeus`，分支 `codex/pr22-devtools-gc`，base
`e2b04db`。该切片补齐 PR-22 中“GC 不持有过期对象”的自动门禁。

## 场景

- Custom Element 先 connect 再 disconnect；consumer 只保留 `targetId`、tag name、
  状态和计数。
- DOM Binding 先 commit 再由 cleanup 清除 target；诊断图保留 kind、计数和 ID。
- 两个原 target 只由 `WeakRef` 引用，并注册 `FinalizationRegistry`；执行 Node 24
  强制 GC，最多等待 20 轮并额外 settle 5 轮。
- GC 后 `WeakRef.deref()` 均为 `undefined`，两个 finalizer 均被观察到；snapshot 仍保留
  binding/custom-element/timeline 摘要，timeline 不含 `target` 字段。

## 复现

```bash
node --expose-gc --import tsx scripts/check/check-devtools-gc.ts
```

环境：macOS 15.7.7 arm64，Node `24.18.0`，V8 原生 `WeakRef`、
`FinalizationRegistry` 与 `global.gc`。连续运行 5 次均通过。

- [原始报告](./report.json)
- [日志](./gc.log.txt)

该门禁验证 DevTools consumer 的内存边界，不把 V8 GC 时序扩大为其它引擎的 GC 保证。
