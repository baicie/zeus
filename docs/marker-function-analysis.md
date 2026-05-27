# `marker` 函数原理与性能分析

## 原理

这个函数用于在 DOM 中查找**锚点节点（anchor）**——即用作控制流插入点的空注释节点 `<!-- -->`。

```ts
export function marker(parent: ParentNode, index: number): Comment {
  let seen = 0

  for (const node of parent.childNodes) {
    if (node.nodeType !== Node.COMMENT_NODE) continue // 只找注释节点
    const comment = node as Comment
    // 过滤：只匹配 <!-- --> 或 <!--! --> 这样的空注释
    if (comment.data !== '' && comment.data !== '!') continue
    if (seen === index) return comment // 返回第 index 个匹配
    seen++
  }

  throw new Error(`[Zeus runtime] marker ${index} not found`)
}
```

### 为什么用注释作为锚点？

1. **不渲染内容** - 注释不会产生任何视觉输出
2. **语义清晰** - 比空 `<div>` 或 `<span>` 更适合作为"位置标记"
3. **控制流必需** - `Show`/`For` 等组件需要知道"在哪里插入/删除 DOM"

## 性能分析

| 指标           | 评估                     |
| -------------- | ------------------------ |
| **时间复杂度** | O(n)，需遍历所有子节点   |
| **空间复杂度** | O(1)，无额外存储         |
| **缓存**       | 无缓存，每次调用重新遍历 |

### 问题点

#### 1. 重复遍历开销大

```ts
// 如果在 effect 里频繁调用
createEffect(() => {
  const anchor = marker(root, 0) // 每次都 O(n) 遍历
  insert(anchor, content())
})
```

#### 2. 兄弟节点多时效率低

```
parent
├── div  (index 0)
├── div  (index 1)     ← 如果要找 index=2
├── div  (index 2)        但有很多普通子节点
├── <!-- -->  (marker)    会遍历很多无关节点
└── <!-- -->
```

## 优化方案

### 方案 A：编译时直接引用

编译器直接生成注释节点 ID，避免运行时查找：

```ts
// 编译后代码直接持有引用
const _for$ = _el$.nextSibling // 直接用 DOM 导航，不用 marker()
```

### 方案 B：弱缓存

```ts
const cache = new WeakMap<ParentNode, Map<number, Comment>>()

export function marker(parent: ParentNode, index: number): Comment {
  if (!cache.has(parent)) {
    // 首次调用建立索引
  }
  return cache.get(parent)!.get(index)!
}
```

## 实际影响

对于 **marker 数量少**（通常 1-3 个）且 **父节点子节点不多** 的场景，当前实现足够用。性能问题主要在高频率调用 + 大量兄弟节点的极端情况下才会明显。

这是典型的 **"先跑通，再优化"** 策略——MVP 阶段正确性优先，后续可用编译器优化（直接生成 DOM 引用）来规避这个问题。
