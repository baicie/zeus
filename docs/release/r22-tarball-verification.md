# R22 发布取证：已发布 tarball 与真实安装

只读审计 + 隔离安装。**未执行任何发布操作。**

审计时间：2026-11-22
registry：`https://registry.npmjs.org`

---

## 1. TASK 42 — 七个已发布包的 tarball

### 1.1 Integrity 全部匹配

7 个 `0.2.0-rc.3` 包逐个下载 tarball，用 `sha512` 重算并与 registry 的
`dist.integrity` 比对：

| 包                                         | 大小      | integrity |
| ------------------------------------------ | --------- | --------- |
| `@zeus-js/compiler`                        | 2,517 B   | **匹配**  |
| `@zeus-js/compiler-native`                 | 3,805 B   | **匹配**  |
| `@zeus-js/compiler-native-darwin-arm64`    | 859,426 B | **匹配**  |
| `@zeus-js/compiler-native-darwin-x64`      | 884,003 B | **匹配**  |
| `@zeus-js/compiler-native-linux-arm64-gnu` | 893,440 B | **匹配**  |
| `@zeus-js/eslint-plugin`                   | 4,424 B   | **匹配**  |
| `@zeus-js/playground-engine`               | 67,621 B  | **匹配**  |

**结论：registry 上的字节与 integrity 记录一致。** 这是三种结论中的第一种
（内容未被篡改），不是"来源可证明"。

### 1.2 产物清单

三个 native 平台包各自只含一个 `.node`，文件名带平台后缀：

```
package/zeus-compiler-native.darwin-arm64.node
package/zeus-compiler-native.darwin-x64.node
package/zeus-compiler-native.linux-arm64-gnu.node
```

`compiler-native` 主包**不含** `.node`——它通过 `optionalDependencies`
分发到平台包。这个设计是正确的。

### 1.3 未能得出的结论

| 结论                          | 状态                                                 |
| ----------------------------- | ---------------------------------------------------- |
| Tarball 内容与 integrity 一致 | **VERIFIED**                                         |
| 压缩包字节级可复现            | **NOT_TESTED**（需用同一源码重新打包比对，本轮未做） |
| 来源可证明（provenance）      | **NOT_TESTED**（见 §3）                              |

按 TASK 42 的要求，这三种结论**不能互相替代**。

---

## 2. 真实安装的发现（超出 TASK 42 预期）

### 2.1 `optionalDependencies` 声明了七个平台包

`@zeus-js/compiler-native@0.2.0-rc.3` 的 package.json：

```json
"optionalDependencies": {
  "@zeus-js/compiler-native-darwin-arm64": "0.2.0-rc.3",
  "@zeus-js/compiler-native-darwin-x64": "0.2.0-rc.3",
  "@zeus-js/compiler-native-linux-arm64-gnu": "0.2.0-rc.3",
  "@zeus-js/compiler-native-linux-x64-musl": "0.2.0-rc.3",
  "@zeus-js/compiler-native-linux-x64-gnu": "0.2.0-rc.3",
  "@zeus-js/compiler-native-win32-arm64-msvc": "0.2.0-rc.3",
  "@zeus-js/compiler-native-win32-x64-msvc": "0.2.0-rc.3"
}
```

其中**四个没有 `0.2.0-rc.3` 版本**：

```
compiler-native-linux-x64-gnu     ← 发布失败在这里（第 8 位）
compiler-native-linux-x64-musl
compiler-native-win32-arm64-msvc
compiler-native-win32-x64-msvc
```

### 2.2 真实安装的结果

在空目录中：

```bash
npm install @zeus-js/compiler-native@0.2.0-rc.3
```

结果：

```
added 1 package in 6s
node_modules/@zeus-js/  →  只有 compiler-native

require('@zeus-js/compiler-native')
→ FAILED: Cannot find native binding.
   npm has a bug related to optional dependencies (npm/cli#4828)
```

**一个平台包都没有装上。** 而显式安装当前平台的包可以工作：

```bash
npm install @zeus-js/compiler-native-darwin-arm64@0.2.0-rc.3
require('@zeus-js/compiler-native')  →  LOADED ok
transformModule(...)                 →  编译成功，0 诊断
```

### 2.3 这意味着什么

**`0.2.0-rc.3` 的 native 编译器无法通过标准安装使用。** 消费者必须手动找到并
安装自己平台的包。

这不是"7/32 已发布"的数字问题，是**已发布的 7 个包本身不可用**。

上一次审计（R21 TASK 34）确认了失败点是第 8 个包
（`compiler-native-linux-x64-gnu`），但当时没有测试"缺少那 4 个包会导致什么"。
现在的答案是：**导致 optional dependency 解析整体失效。**

### 2.4 为什么 npm 全跳过了

npm 的 `#4828` 是已知问题：当 `optionalDependencies` 中**部分**条目在 registry
上不存在时，某些 npm 版本会放弃整组，而不是装上存在的那几个。

本轮观察到的是：一个都没装。具体是 npm 的哪个分支导致了"全跳过"而非"装存在的
那些"，**未进一步定位**——那是 npm 内部行为，不是本仓库能修的。

---

## 3. Provenance（未执行）

`npm view <pkg>@0.2.0-rc.3 dist.attestations` 未查询。本轮未验证这 7 个包是否
带 provenance attestation。

**这也是 TASK 42 里"来源可证明"那一层的答案：没有数据，就是 NOT_TESTED，不是
"应该没问题"。**

---

## 4. 对 RC 恢复的影响

原本的恢复计划是"重跑 rc.3，`skipExisting` 跳过已发布的 7 个包，从第 8 个继续"。

**这个计划仍然成立**，但优先级变了：

- 即使 32 个包全部发布，只要有任何平台包缺失，`optionalDependencies` 就会整体
  失效；
- 因此恢复必须**一次全部完成**，不能停在中间状态；
- 已发布的 7 个包本身没有问题（integrity 匹配、内容正确），问题在于它们依赖的
  平台包缺了 4 个。

**新增的恢复前置条件：恢复运行结束后，必须在每个目标平台上真实安装并加载一次
`@zeus-js/compiler-native`，而不是只看发布数量。**

---

## 5. 本轮未做

| 项                               | 原因                 |
| -------------------------------- | -------------------- |
| 字节级可复现性                   | 需同源码重新打包比对 |
| Provenance attestation           | 未查询               |
| npm 全跳过的精确分支             | npm 内部行为         |
| 隔离 registry 演练（TASK 45–49） | 未执行               |
| TLOG 409 原始日志（TASK 43）     | 未执行               |
