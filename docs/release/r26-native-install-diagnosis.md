# 脚手架安装诊断：Native 平台包为什么没装

R25 收尾时，用正式发布的 `create-zeus` 产物执行脚手架验收，
`@zeus-js/vite-plugin@0.0.6` 依赖的 `compiler-native` 报
`Cannot find module '@zeus-js/compiler-native-darwin-arm64'`。当时的处理是手工把
`.node` 放进预期位置，构建与 Chromium 渲染都通过了。

**手工补进去只能证明 native binary 可用，不能证明默认安装链路正确。** 本文记录
真正的根因。

---

## 结论

不是 npm 的 optional-dependency 缺陷（`npm/cli#4828`），也不是发布包元数据缺陷。

**是执行安装的 Node 版本低于包声明的 `engines`。**

---

## 证据链

按调查顺序，每一步都是实测：

| 步骤                                                    | 结果                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------- | --- | ------------ |
| `compiler-native@0.2.0-rc.8` 的 `optionalDependencies`  | 7 个平台包，版本全部 `0.2.0-rc.8`                               |
| 平台包 `compiler-native-darwin-arm64@0.2.0-rc.8` 元数据 | `os: ["darwin"]`、`cpu: ["arm64"]`、`engines: {"node":"^22.18.0 |     | >=24.11.0"}` |
| 项目级 `.npmrc` 指向官方 registry 后重试                | 仍只装 1 个包                                                   |
| 执行安装的 Node                                         | **v22.12.0**，不满足 `^22.18.0`                                 |
| **换成 Node 24.16.0 重试**                              | **装上 2 个包，平台包到位，loader 加载成功**                    |
| 仓库 `.node-version`                                    | `24.16.0`                                                       |
| Core CI 的 Node                                         | 全部 `node-version-file: .node-version`                         |
| Ecosystem CI 的 Node 矩阵                               | `['22', '24']` —— `22` 解析到最新 22.x（≥22.18），满足          |

---

## 复现

```bash
# 失败：Node 22.12.0（低于 engines）
node --version                                   # v22.12.0
npm install @zeus-js/compiler-native@0.2.0-rc.8
ls node_modules/@zeus-js | grep native-          # 空

# 成功：Node 24.16.0
PATH=/path/to/node-v24.16.0/bin:$PATH \
  npm install @zeus-js/compiler-native@0.2.0-rc.8
ls node_modules/@zeus-js | grep native-          # compiler-native-darwin-arm64
node -e "require('@zeus-js/compiler-native')"    # 无错误
```

两次安装使用同一个 registry、同一个锁文件、同一台机器，唯一变量是 Node 版本。

---

## 为什么这不是「npm 有 bug」

错误信息本身指向 `npm/cli#4828`，而那条 issue 描述的是 npm 在解析
`optionalDependencies` 时丢包。这里的行为不同：

- npm **按 `engines` 判定该平台包不适用于当前运行时**，因此不安装它 —— 这是
  optional dependency 的预期语义，不是丢包；
- 满足 `engines` 的 Node 上，同一条命令装得出来；
- `os`/`cpu` 正确，`optionalDependencies` 完整，tarball 可下载。

把它记成 npm 缺陷会掩盖真正该修的东西：**用不受支持的运行时执行验收**。

---

## 第二个缺陷：门禁用 CJS 解析 ESM-only 包

修好 Node 版本后，验收又停在另一处：

```
node -e process.stdout.write(require.resolve(process.argv[1])) @zeus-web/button
Error: No "exports" main defined
```

`@zeus-web/*` 是 **ESM-only**：`exports` 只有 `import` 与 `types` 条件，没有
`require`。门禁用 `require.resolve` 去问它 —— 包装得好好的，解析器问了一个它不
回答的问题，报错读起来却像安装失败。

改为 `import.meta.resolve`（`--input-type=module`），尊重 `import` 条件并返回
URL，再由 `fileURLToPath` 转成路径。解析仍在 fixture 目录下执行，所以答案永远是
fixture 自己的安装，不会落回源码工作区 —— 那条断言保留。

修好后六个模板全部通过：

```
[create-zeus registry] basic-ts: all checks passed
[create-zeus registry] application-ts: all checks passed
[create-zeus registry] admin-ts: all checks passed
[create-zeus registry] component-library-ts: all checks passed
[create-zeus registry] web-component-ts: all checks passed
[create-zeus registry] webc-consumer-ts: all checks passed
```

`webc-consumer-ts` 从 registry 装上 `@zeus-web/button@0.2.0-rc.8`（58 个包），
构建产物 61.38 kB。没有复制 `.node`，没有注入 override，没有用本地 tarball。

---

## 对验收状态的影响

`pair-amendment/v0.2.0-rc.8.accepted` 里 `SCAFFOLD_REGISTRY_VERIFIED` 的备注写明
了「npm 10 不装 optional 平台包，因此显式放置了 native binary」。那段描述**不准确**：
真实原因如上。

该 tag 不可变，不改它。更正记录在本文件，以及
`pair-amendment/v0.2.0-rc.8.accepted-v2`（补齐无干预安装的完整验收后追加）。

---

## 给运维的一条

任何在本机跑脚手架验收的人，先确认 `node --version` 满足
`.node-version`，否则看到的是环境问题，不是产品缺陷。
