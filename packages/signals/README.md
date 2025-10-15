# @zeus-js/signals

一个轻量级、高性能的响应式信号库，基于 [alien-signals](https://github.com/stackblitz/alien-signals) 的核心算法实现。

## 来源

本库的核心算法来源于 [alien-signals](https://github.com/stackblitz/alien-signals) 项目，这是一个探索基于推拉（push-pull）信号算法的项目。alien-signals 的算法与以下项目相似或相关：

- Vue 3 的传播算法
- Preact 的双向链表方法
- Svelte 的内部效果调度
- Reactively 的图着色方法

## 特性

- 🚀 **极高性能** - 基于优化的推拉算法，比 Vue 3.4 更快
- 📦 **轻量级** - 极小的包体积
- 🔧 **简单 API** - 直观的信号、计算值和副作用 API
- 🎯 **类型安全** - 完整的 TypeScript 支持
- 🌳 **作用域管理** - 支持 effect 作用域，便于清理资源

## 安装

```bash
npm install @zeus-js/signals
```

## 基本用法

### 信号 (Signals)

```typescript
import { signal } from '@zeus-js/signals'

// 创建信号
const count = signal(0)

// 读取值
console.log(count()) // 0

// 设置值
count(1)
console.log(count()) // 1
```

### 计算值 (Computed)

```typescript
import { signal, computed } from '@zeus-js/signals'

const count = signal(1)
const doubleCount = computed(() => count() * 2)

console.log(doubleCount()) // 2

count(2)
console.log(doubleCount()) // 4
```

### 副作用 (Effects)

```typescript
import { signal, effect } from '@zeus-js/signals'

const count = signal(0)

// 创建副作用
const stopEffect = effect(() => {
  console.log(`Count is: ${count()}`)
}) // 输出: Count is: 0

count(1) // 输出: Count is: 1
count(2) // 输出: Count is: 2

// 停止副作用
stopEffect()
count(3) // 无输出
```

### 作用域 (Effect Scope)

```typescript
import { signal, effect, effectScope } from '@zeus-js/signals'

const count = signal(0)

// 创建作用域
const stopScope = effectScope(() => {
  effect(() => {
    console.log(`Count in scope: ${count()}`)
  }) // 输出: Count in scope: 0
})

count(1) // 输出: Count in scope: 1

// 停止作用域，清理所有内部副作用
stopScope()
count(2) // 无输出
```

## API 参考

### `signal<T>(initialValue?: T)`

创建一个响应式信号。

**参数:**

- `initialValue` - 初始值（可选）

**返回:**

- 一个函数，可以用于读取或设置值

### `computed<T>(getter: (previousValue?: T) => T)`

创建一个计算值，基于其他响应式值计算得出。

**参数:**

- `getter` - 计算函数，接收前一个值作为参数

**返回:**

- 一个函数，用于获取计算值

### `effect(fn: () => void)`

创建一个副作用，当依赖的响应式值变化时自动执行。

**参数:**

- `fn` - 副作用函数

**返回:**

- 一个函数，用于停止副作用

### `effectScope(fn: () => void)`

创建一个作用域，用于管理多个副作用。

**参数:**

- `fn` - 作用域函数

**返回:**

- 一个函数，用于停止作用域并清理所有内部副作用

## 性能特点

本库采用了以下优化策略：

1. **推拉混合算法** - 结合了推送和拉取的优势
2. **无递归调用** - 核心算法避免了递归，提高性能
3. **最小化内存分配** - 避免使用 Array/Set/Map，减少 GC 压力
4. **批量更新** - 支持批量更新，减少不必要的重新计算

## 基准测试

本库包含完整的基准测试套件，包括：

- 内存使用测试
- 性能基准测试
- 复杂场景测试

运行基准测试：

```bash
npm run test:benchmarks
```

## 许可证

MIT License

## 致谢

感谢 [alien-signals](https://github.com/stackblitz/alien-signals) 项目提供的优秀算法实现，以及所有贡献者的努力。

---

> 本库基于 [alien-signals](https://github.com/stackblitz/alien-signals) 的核心算法实现，旨在为 Zeus 项目提供高性能的响应式状态管理能力。
