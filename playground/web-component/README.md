## Vite Web Components Demo

用 Vite 直接跑一个可视化项目，验证 `@zeus-js/web-components`：

- 在浏览器里注册并渲染自定义元素（Custom Elements）
- 通过修改 attribute 触发重新渲染
- 覆盖 Light DOM 和 Shadow DOM 两种模式

### 运行

在仓库根目录：

```bash
pnpm install
pnpm -C playground/vite-web-components-demo dev
```

访问终端输出的本地地址即可。

### 构建

```bash
pnpm -C playground/vite-web-components-demo build
pnpm -C playground/vite-web-components-demo preview
```
