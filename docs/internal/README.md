# docs/internal

Zeus 项目内部设计文档与进度追踪。

---

## 目录结构

每个阶段对应一个主题文件夹，命名格式为 `stageXX-<task>`（XX 为序号，task 为主任务名）。

```
docs/internal/
├── README.md
│
├── stage00-mvp-rfc/               # MVP-0：架构 RFC
│   ├── design/
│   ├── review/
│   └── roadmap.md
│
├── stage01-reactivity-core/       # MVP-1~2：响应式核心 + Babel 编译器基线
│   ├── design/
│   ├── review/
│   └── roadmap.md
│
├── stage02-control-flow/          # MVP-3~4：控制流 + Vite 集成
│   ├── design/
│   ├── review/
│   └── roadmap.md
│
├── stage03-web-components/        # MVP-5~6：Web Components + Light DOM 投影
│   ├── design/
│   ├── review/
│   └── roadmap.md
│
├── stage04-optimization/          # MVP-7：优化与编译器演进
│   ├── design/
│   ├── review/
│   └── roadmap.md
│
├── stage05-component-compiler-host/  # 组件编译器宿主（当前进行中）
│   ├── design/
│   ├── review/
│   └── roadmap.md
│
├── issues/                        # 通用 issue 追踪
├── reference/                     # 参考资料
└── rfc/                          # 正式 RFC 文档
```

## 创建新阶段

使用项目根目录的脚本：

```bash
pnpm run new:stage <number> <task-name>
```

例如：

```bash
pnpm run new:stage 06 headless-components
```

这会在 `docs/internal/stage06-headless-components/` 下创建：

```
design/
review/
roadmap.md
```

## 阶段命名约定

- 序号使用两位数字补零：`stage00` ~ `stage99`
- task 名使用 kebab-case，全小写，描述主任务
- 已有的阶段见上方目录结构

## MVP 阶段与 stage 命名对照

| Stage   | MVP 范围 | 主题                            |
| ------- | -------- | ------------------------------- |
| stage00 | MVP-0    | 架构 RFC                        |
| stage01 | MVP-1~2  | 响应式核心 + Babel 编译器基线   |
| stage02 | MVP-3~4  | 控制流 + Vite 集成              |
| stage03 | MVP-5~6  | Web Components + Light DOM 投影 |
| stage04 | MVP-7    | 优化与编译器演进                |
| stage05 | 当前     | 组件编译器宿主                  |
