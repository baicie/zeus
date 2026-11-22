# R22 Packed Consumer 隔离审计（TASK 31、35）

只读审计。基于真实 tarball 与真实安装。

---

## 1. `check:packed-consumers` 已经做了什么

`scripts/check/check-packed-consumers.ts`：

- 用 `fs.mkdtempSync` 在系统临时目录创建消费者项目
- 用 `pnpm pack` 产出 tarball 到临时目录
- 在消费者项目中安装这些 tarball
- **验证依赖没有逃出安装目录**：

```ts
const installed = fs.realpathSync(...)
if (!installed.startsWith(fs.realpathSync(directory) + path.sep))
  throw new Error(`Consumer dependency escaped its installation: ${name}`)
```

这条检查是对的：如果安装结果通过 symlink 指回 monorepo，`realpath` 会落在目录外，测试失败。

**结论：`check:packed-consumers` 已经是隔离的**，不需要重建。

---

## 2. TASK 31 新增的验证：已发布 tarball 是否自包含

对 registry 上 7 个 `0.2.0-rc.3` 包解包并检查 `package.json` 的依赖字段：

| 包                                         | `workspace:` / `file:` / `link:` 引用 |
| ------------------------------------------ | ------------------------------------- |
| `@zeus-js/compiler`                        | 无                                    |
| `@zeus-js/compiler-native`                 | 无                                    |
| `@zeus-js/compiler-native-darwin-arm64`    | 无                                    |
| `@zeus-js/compiler-native-darwin-x64`      | 无                                    |
| `@zeus-js/compiler-native-linux-arm64-gnu` | 无                                    |
| `@zeus-js/eslint-plugin`                   | 无                                    |
| `@zeus-js/playground-engine`               | 无                                    |

**7/7 自包含。** 发布的 tarball 不带 workspace 协议引用。

---

## 3. 源码侧的 `workspace:*`

32 包中有 **20 个**在源码 `package.json` 里使用 `workspace:*`：

```
@zeus-js/testing            → signal, zeus
@zeus-js/bundler-plugin     → compiler-native, component-analyzer
@zeus-js/component-dts      → component-analyzer
@zeus-js/web-c-runtime      → runtime-dom
@zeus-js/web-c              → 8 个
@zeus-js/output-wc          → 5 个
@zeus-js/output-react-wrapper → 4 个
@zeus-js/output-vue-wrapper → 4 个
@zeus-js/output-icons       → 1 个
@zeus-js/playground-engine  → 3 个
```

这是 pnpm 的正常用法，发布时由 `pnpm publish` 重写为具体版本号。

**已验证的部分**：已发布的 7 个包转换正确（§2）。
**未验证的部分**：其余 25 个包的转换只在恢复发布时才会发生，本轮无法验证。

这不是缺陷，是一个**只能在发布后验证**的属性。记录在此，恢复后应重新跑本节。

---

## 4. 真实安装验证（与 TASK 42 合并）

在空目录中安装 `@zeus-js/compiler-native@0.2.0-rc.3`：

```
added 1 package
node_modules/@zeus-js/  →  只有 compiler-native
require(...)  →  Cannot find native binding
```

显式安装平台包后正常：

```
npm install @zeus-js/compiler-native-darwin-arm64@0.2.0-rc.3
require(...)          →  LOADED ok
transformModule(...)  →  编译成功，0 诊断
```

**这是 TASK 31 结论的核心**：隔离安装路径本身是对的（tarball 自包含、安装不逃逸），但 `optionalDependencies` 因缺 4 个平台包而整体失效。

详见 [`docs/release/r22-tarball-verification.md`](../release/r22-tarball-verification.md) §2。

---

## 5. TASK 35 — 公共包依赖清单

未逐包审查 `exports` / `types` / `sideEffects`。**NOT_RUN。**

已确认的部分：

- 已发布 tarball 的依赖字段不含 workspace 协议（§2）
- `compiler-native` 的 `optionalDependencies` 声明了 7 个平台包（§4）
- `compiler` 依赖 `compiler-native@0.2.0-rc.3`，版本精确匹配

---

## 6. 结论

| 项目                              | 状态                                            |
| --------------------------------- | ----------------------------------------------- |
| `check:packed-consumers` 的隔离性 | **VERIFIED**（已存在，有 realpath 检查）        |
| 已发布 tarball 自包含             | **VERIFIED** 7/7                                |
| 未发布包的 workspace 转换         | **NOT_TESTED**（只能在发布后验证）              |
| 隔离安装可用性                    | **FAILED**（native 包无法自动安装，见 TASK 42） |
| 逐包 exports/types 审查           | **NOT_RUN**                                     |
