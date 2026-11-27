# Examples 与 Demo 的归属

三仓拆分之后，「这个示例该放哪」有了两个可能的答案，于是同一份代码出现在两个
地方。本文记录判断标准，以及每条示例现在的位置。**标准是「谁需要它」，不是
「写得好不好看」。**

## 判断标准

| 问题                                                | 是 →                         | 否 →                         |
| --------------------------------------------------- | ---------------------------- | ---------------------------- |
| core 的测试、生成器或 registry 是否需要它作为输入？ | 留在 `zeus/examples/`        | 继续问                       |
| 它是完整产品（多页、多状态、有独立交互模型）？      | 迁到 `zeus-ecosystem/demos/` | 继续问                       |
| 它演示单个框架能力，一两个文件能说清？              | 留在 `zeus/examples/`        | 迁到 `zeus-ecosystem/demos/` |

第一条优先于后两条。一个示例写得再完整，只要 core 的测试拿它当 fixture，删掉
就会让某个门禁失去输入——那它属于 core。

## 现在的位置

### `zeus/examples/` —— 框架与 fixture

| 示例                                              | 为什么在这里                                       |
| ------------------------------------------------- | -------------------------------------------------- |
| `counter`、`todo`、`context`                      | 最小可读的框架入门                                 |
| `admin`                                           | 路由、loader、权限的参考实现；`check:admin` 驱动它 |
| `web-component`、`light-dom-slots`                | Web Components 是核心语义，示例即规格              |
| `react-wrapper`、`vue-wrapper`、`stencil-wrapper` | interop fixture，parity 语料的一部分               |
| `registry-react`、`registry-vue`                  | `check:registry-cli` 的输入                        |
| `headless`                                        | **fixture，不是第二份实现**，见下                  |
| `headless-demo`、`use-headless-*`                 | 上面那份 fixture 的消费示例                        |
| `devtools-panel`                                  | 通用 DevTools 实现的演示宿主                       |
| `next-boundary`、`fixtures`                       | 框架边界与测试输入                                 |

### `zeus-ecosystem/demos/` —— 完整产品

| 示例            | 来源                                                |
| --------------- | --------------------------------------------------- |
| `project-board` | 从 `zeus/examples/project-board` 迁入（2026-11-27） |

它用已发布包构建（`@zeus-js/zeus@0.2.0-rc.5` + `@zeus-js/vite-plugin@0.0.6`），
没有 `workspace:` 依赖，也没有指向 core 源码的 `paths` alias。对应的体检脚本
是仓库根的 `validate-repository.mjs`：它把跨仓 `workspace:` 链接和 `file:` 依赖
判为失败。

## `headless` 为什么留在 core

`zeus-ui` 里有三份名字相近的东西：

| 位置                        | 包名                 | 版本            | 性质                    |
| --------------------------- | -------------------- | --------------- | ----------------------- |
| `zeus-ui/packages/headless` | `@zeus-web/headless` | `0.1.0-beta.35` | **正式发布实现**        |
| `zeus-ui/examples/headless` | `@zeus-ui/headless`  | `0.0.1`         | UI 侧的演示             |
| `zeus/examples/headless`    | `@zeus-ui/headless`  | `0.0.1`         | **core 的测试 fixture** |

core 的那份被三个地方读取：

- `packages/web-c/component-analyzer/__tests__/analyzeFile.spec.ts`
- `scripts/release/check-registry-cli.ts`
- `scripts/testing/compile-test-views.ts`

删掉它会让这三个测试失去输入，所以按第一条标准它留在 core。**它不是第二份正式
实现**——正式实现在 `zeus-ui/packages/headless`，版本线是 `0.1.0-beta.*`。两份
`0.0.1` 的 `@zeus-ui/headless` 互不相干，各自服务自己仓库的用例。

如果要合并它们，那是「把 fixture 换成对发布包的依赖」的独立决定，涉及三个测试
的输入形态，不属于示例归属调整。

## `zeus-ui` 里的旧应用

`examples/ai-workbench`、`examples/ai-host`、`examples/ai-showcase` 是已迁移应用
的旧实现。**迁移完成不等于可以删除**：它们的生产入口可能仍在服务流量，替代路径
（`zeus-ecosystem/apps/*` 的镜像与部署单元）必须先完成接管。删除动作属于最终的
交付交接，不在示例归属这一步。

同理，`zeus-ui/packages/ai-*` 与 `packages/headless` 是**正式组件实现**，无论
`examples/` 里有什么都不受影响。

## 迁移一个示例时的检查清单

1. 新位置用**已发布包**构建，删掉 `paths` alias 与 `workspace:` 依赖。
2. `pnpm check`（tsc）与 `pnpm build` 都要在新位置跑通。
3. 在浏览器里跑一次真实交互——构建成功不代表产品还在。
4. 如果它在 parity 语料里，**同一次提交**改
   `packages/compiler/compiler-wasm/__tests__/parity.test.mjs` 的精确计数。
5. `grep` 全仓引用：`package.json` 的脚本、CI 的 impact 分析、文档表格。
6. 删掉旧路径下的 `node_modules/` 与 `dist/`，否则 `pnpm-workspace` 仍会看见它。
