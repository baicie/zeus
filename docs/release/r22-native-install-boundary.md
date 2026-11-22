# R22 TASK 33：native 编译器的安装边界

**只读 registry 查询 + 空目录真实安装。未执行任何发布操作。**

测量时间：2026-11-22
registry：`https://registry.npmjs.org`
平台：darwin arm64

---

## 1. 我先写错了一个结论，这里是修正

`docs/release/r22-tarball-verification.md`（R22 TASK 42）里写过：

> **`0.2.0-rc.3` 的 native 编译器无法通过标准安装使用。** 消费者必须手动找到并
> 安装自己平台的包。
>
> 上一次审计确认了失败点是第 8 个包（`compiler-native-linux-x64-gnu`），但当时
> 没有测试「缺少那 4 个包会导致什么」。现在的答案是：**导致 optional dependency
> 解析整体失效。**

**这个因果判断是错的。** 缺包是真的，但它不是那次安装失败的原因。

错在这里：我在**一台机器的同一个 npm 版本**上看到「装了 1 个而不是 2 个」，
就把它归因到 registry 状态。没有换 npm 版本重测，就写下了结论。

---

## 2. 实测：变量是 npm 版本，不是缺包

同一台机器、同一个 registry、同一个版本的包，只换 npm：

| npm         | 随附于     | `npm install @zeus-js/compiler-native@0.2.0-rc.3` | `require(...)`               |
| ----------- | ---------- | ------------------------------------------------- | ---------------------------- |
| **10.9.0**  | Node 22.12 | `added 1 package`，只有 wrapper                   | `Cannot find native binding` |
| **11.13.0** | Node 24.16 | `added 2 packages`，wrapper + `darwin-arm64`      | `LOADED function`            |

`npm ls --all` 在失败那一侧把**每一个** optional 依赖都标成 `UNMET`，包括
registry 上确实存在、且与本机匹配的那一个。

### 2.1 用「七平台齐全」的版本反证

`0.1.1-canary.20261020.189.1.8bec46e1` 的七个平台包**全部已发布**（逐个查过
`npm view`，版本都在）。

- 在 **npm 10.9.0** 下：`added 1 package`，七个全 `UNMET`，加载失败。
- 在 **npm 11.13.0** 下：装上 wrapper + `darwin-arm64`，加载成功。

**缺包不是变量。** 七个全在，旧 npm 一样全丢。

### 2.2 在 npm 11 下重测 rc.3

```
npm install @zeus-js/compiler-native@0.2.0-rc.3
→ added 2 packages
node_modules/@zeus-js/  →  compiler-native, compiler-native-darwin-arm64
require('@zeus-js/compiler-native')  →  LOADED, transformModule 是函数
```

**`0.2.0-rc.3` 在现代 npm 上可以正常安装和使用。** 它本机平台的包
（`darwin-arm64`）是发布了的——缺的四个是别的平台的。

---

## 3. 这仍然是真实的消费者缺陷，而且比原来的结论更麻烦

原因是 `engines` 允许的 Node 版本区间与 npm 的行为撞在一起：

| Node                      | 随附 npm | 结果                               |
| ------------------------- | -------- | ---------------------------------- |
| 22.18.0（`engines` 下限） | 10.9.3   | **装不上**                         |
| 22.20.0                   | 10.9.3   | **装不上**                         |
| 22.21.0                   | 10.9.4   | **装不上**（未逐版实测，同主版本） |
| 24.16.0                   | 11.13.0  | 正常                               |

`engines` 写的是 `^22.18.0 || >=24.11.0`，所以**每一个被声明为受支持的 Node 22
版本，自带的 npm 都是会丢包的 10.x**。用户完全按 `engines` 办事，装出来的东西
就是不能用的，而且错误信息把锅甩给「npm 的 optional dependency bug，请删了
node_modules 重装」——重装多少次都一样。

这不是 rc.3 的发布事故，是**支持矩阵里的一个空洞**。

---

## 4. 新增检查：`check:native-install`

`release:verify:published` 只问「版本在 registry 上可见吗」。rc.3 那次它是对的：
能看到的包都在，integrity 也匹配。它没问的是「装得上吗」。

新检查（`scripts/check/check-native-install.ts`）问完整的四件事：

1. 本机平台包在该版本存在（缺了要单独报，而不是最后变成 `Cannot find native binding`）；
2. `npm install` 之后平台包**真的在 `node_modules` 里**；
3. 在干净进程里 `require` 能加载，`transformModule` 是函数；
4. 用它编译一个真实组件，0 诊断且有输出。

加载和编译分开断言：ABI 不匹配的 `.node` 能加载，第一次调用才抛。

失败信息里直接写出 npm 版本和实测对照，因为**「先换一个现代 npm」应该是第一个
排查动作，不是最后一个**。

### 4.1 两种结果都实测过

```
# 阳性：npm 11.13.0 / Node 24.16
pnpm check:native-install --version 0.2.0-rc.3        → passed

# 阴性：npm 10.9.0 / Node 22.12
pnpm check:native-install --version 0.2.0-rc.3        → failed，消息指出 npm 版本
```

---

## 5. 仍然成立的部分

`r22-tarball-verification.md` 的 §1（7 个包的 integrity 全部匹配）与 §3（provenance
未查询）不受影响，那两节没有依赖错误的因果。

仍然缺失、且是真实发布缺口的是**四个平台包没有 `0.2.0-rc.3`**：

```
compiler-native-linux-x64-gnu        ← 发布失败在第 8 位
compiler-native-linux-x64-musl
compiler-native-win32-arm64-msvc
compiler-native-win32-x64-msvc
```

后果比原来写的轻——不是「所有平台都装不上」，而是**那四个平台的用户装不上**，
darwin 用户可以。这个区别对恢复顺序有影响：不必当成 P0 全线阻塞，但那四个平台
在恢复完成前确实不可用。

---

## 6. 本轮未做

| 项                          | 原因                                         |
| --------------------------- | -------------------------------------------- |
| npm 10 里丢包的确切代码路径 | npm 内部行为，不由本仓库修                   |
| Node 22.21 / 22.22 逐版实测 | 只确认了 22.18 / 22.20 的随附 npm 是 10.9.3  |
| 是否收紧 `engines`          | 影响 16 个包与整条支持矩阵，是独立的发布决策 |
| 隔离 registry 安装          | 未执行（检查脚本已支持 `--registry`）        |
