# create-zeus

交互式生成 Zeus + Vite + TypeScript 项目，提供四类模板：

- `basic-ts`：最小 Zeus Native 应用。
- `application-ts`：Zeus Native 应用，包含 Vitest 测试命令。
- `web-component-ts`：最小 Zeus Web Component。
- `component-library-ts`：Web Component、React/Vue wrapper、DTS 和组件 manifest 输出。

```bash
pnpm create zeus
```

运行后输入项目目录名并选择模板。目标不存在时创建；目标为空目录时直接写入。目标是非空目录时，默认报错并保留全部现有文件，不提供默认覆盖选项。

如需替换普通项目目录，必须显式传入 `--force`：

```bash
pnpm create zeus --force
```

选择模板后，CLI 会显示即将被永久清空的绝对路径和不可撤销提示。确认默认是“否”；取消或拒绝确认均保留文件。确认后、实际写入前还会重新检查目标。

以下路径即使使用 `--force` 也拒绝：

- 文件系统根、当前工作目录、用户家目录，以及这些受保护目录的祖先路径。
- 含 `.git` 文件或目录的 Git 仓库根目录，以及 `.git` 元数据路径。
- 目标自身、现有中间路径中的符号链接，包括悬空链接。
- 已存在的普通文件，以及与脚手架模板安装目录重叠的目标。

macOS 固定的 `/var`、`/tmp`、`/etc` 到 `/private/...` 系统目录别名仅可作为父路径使用，并先转换为真实路径检查；不能把这些链接自身作为生成目标。用户创建的链接不属于此例外。

`scaffold()` 内部写入边界也执行同一检查，调用方必须显式传入 `force: true` 才能替换普通非空目录；绕过交互界面不会绕过目录保护。模板名只接受内置名称，不能通过相对路径访问其他模板源。

验证命令：

```bash
pnpm exec vitest run --project unit packages/devtools/create-zeus
pnpm --filter create-zeus build
pnpm check:create-zeus
pnpm check:create-zeus-registry
```

`check:create-zeus` 会为四种模板生成临时项目，运行 TypeScript 检查和 Vite
生产构建。`check:create-zeus-registry` 会检查模板依赖范围是否能匹配 npm
registry 中已发布的 Zeus 包版本。

测试使用真实临时目录、文件、Git 标记和符号链接，并模拟 CLI 确认；不会对真实仓库根或家目录执行覆盖。
