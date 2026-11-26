# R19 补充任务 · Playground 迁移审计（P1）

> 状态：审计完成，迁移未开始。本文只记录事实与阻塞，不含实施结果。

## 一、资产位置与规模

| 位置                                     | 文件数           | 行数 | 计划归属                    |
| ---------------------------------------- | ---------------- | ---- | --------------------------- |
| `examples/playground-editor/`            | 37               | 7739 | Playground 应用 → ecosystem |
| `packages/tooling/playground-engine/`    | 25               | —    | Core 通用工具（保留）       |
| `scripts/playground/`                    | 12 个脚本 + 测试 | —    | 按断言拆分                  |
| `.github/workflows/playground-image.yml` | —                | —    | 产品交付 → ecosystem        |
| `.github/workflows/playground-pages.yml` | —                | —    | 静态站点交付 → ecosystem    |

## 二、硬阻塞：`@zeus-js/compiler-wasm` 从未发布

这是整个迁移能否开始的前提，**必须先决策**。

`packages/compiler/compiler-wasm/package.json`：

```json
{
  "name": "@zeus-js/compiler-wasm",
  "version": "0.1.1-beta.20",
  "private": true
}
```

- `private: true`，不在 32 包固定发布组内。
- npm 上查无此包。
- Playground 以 `workspace:*` 依赖它，这是它**唯一**的消费者。

`docs/architecture/packages.md:58` 记录了这个设计决定：

> `compiler-wasm` is `private: true` and is not in the fixed release group.
> That is deliberate — **it ships inside the Playground build rather than to npm.**

这条前提与 P2.2 直接冲突：迁移后 Playground 在 `zeus-ecosystem`，
不能再用 workspace 依赖，也不允许把 WASM 源码复制进应用。

**三条可选路径，需要明确选择：**

1. **发布 `@zeus-js/compiler-wasm`**（推荐）。`files` 已包含
   `index.js` / `index.d.ts` / `worker.js` / `worker.d.ts` /
   `zeus-compiler.wasm`，产物齐全（wasm 1.5 MB，整包约 1.6 MB）。
   需要：移出 `private`、纳入发布组或独立版本线、决定版本线
   （它现在停在 `0.1.1-beta.20`，与 core `0.2.0-rc.5` 不同步）。
2. **由 `zeus-ecosystem` 自己构建 WASM**。违反 P2.2「不得在 Docker
   构建过程中重新构建整个 Core」，且需要 Rust 工具链。
3. **放弃 WASM，Playground 只用 native compiler**。不成立：
   Playground 在浏览器里运行，native 是 Node napi 产物。

选 1 时还要回答：它跟 `vite-plugin` / `devtools-consumer` 一样走独立版本线，
还是并入 32 包固定组？前者更合理——它的版本与 core 无耦合。

## 三、其余依赖已就绪

| 包                                                                  | 状态          | 证据                                                         |
| ------------------------------------------------------------------- | ------------- | ------------------------------------------------------------ |
| `@zeus-js/playground-engine`                                        | ✅ 已发布     | 在 `zeusFixedPackages` 内，与 core 同步；npm 有 `0.2.0-rc.3` |
| `@zeus-js/zeus`、`router`、`query`、`i18n`、`signal`、`runtime-dom` | ✅ 已发布     | ecosystem `apps/admin` 已在用 `0.2.0-rc.5`                   |
| `@zeus-js/vite-plugin`                                              | ✅ 独立版本线 | `0.0.6`，ecosystem 已用                                      |

即：**除 compiler-wasm 外，Playground 的依赖全部可以由发布包满足。**

## 四、API 补全生成器需要改数据源（P6）

`scripts/playground/generate-api-completions.ts` 当前读的是**源码构建产物**：

```ts
const repoRoot = path.resolve(import.meta.dirname, '../..')
const ENTRY_PACKAGE_DIR = path.join(repoRoot, 'packages/core/zeus')
```

它通过 TypeScript 编译器加载 `packages/core/zeus/dist/zeus.d.ts`，
用 type checker 提取导出、重载与文档注释。设计本身是对的（不是正则、
不是硬编码），只是**数据源路径绑定了 core 仓库结构**。

迁移后改为解析 `node_modules/@zeus-js/zeus` 的 `exports["."].types` 即可，
逻辑不变。P6 要求「不得依赖相邻 Core 仓库的源码路径」，正好对应这一处。

## 五、待补：P2–P13

审计的其余维度（应用源码逐文件分类、engine 边界、安全边界、
CI/交付、测试拆分、Core examples 分类）由并行审计产出，
落定后并入本文档。
