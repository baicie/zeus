# Zeus Framework Demo

这是一个完整的Zeus框架演示项目，展示了框架的核心功能和用法。

## 功能特性

- ✅ **响应式系统**: 使用Signal实现的数据响应式
- ✅ **组件系统**: 函数式组件定义和渲染
- ✅ **生命周期钩子**: 组件的挂载、更新、卸载生命周期
- ✅ **DOM渲染**: 高效的DOM操作和更新
- ✅ **事件处理**: 声明式事件绑定
- ✅ **TypeScript支持**: 完整的类型安全

## 演示内容

### 1. 计数器组件 (Counter)
- 展示响应式数据绑定
- 展示计算属性 (computed)
- 展示生命周期钩子

### 2. 待办事项应用 (TodoApp)
- 展示列表渲染
- 展示事件处理
- 展示动态数据更新

## 快速开始

### 安装依赖

```bash
# 确保在项目根目录
cd /path/to/zeus

# 安装所有依赖
pnpm install
```

### 运行演示

```bash
# 进入demo目录
cd playground/demo

# 启动开发服务器
pnpm run dev
```

### 构建生产版本

```bash
# 构建生产版本
pnpm run build

# 预览生产版本
pnpm run preview
```

## 项目结构

```
playground/demo/
├── src/
│   ├── main.ts          # 应用入口
│   └── App.tsx          # 主应用组件
├── index.html           # HTML模板
├── vite.config.ts       # Vite配置
├── tsconfig.json        # TypeScript配置
└── package.json         # 项目配置
```

## 核心概念演示

### 响应式数据

```typescript
import { ref, computed } from '@zeus-js/runtime-core'

const count = ref(0)
const doubleCount = computed(() => count.value * 2)

// 修改数据会自动触发更新
count.value++
```

### 组件定义

```typescript
import { defineComponent } from '@zeus-js/runtime-core'

const MyComponent = defineComponent({
  name: 'MyComponent',
  setup() {
    // 组件逻辑
    return () => ({
      type: 'div',
      props: { class: 'my-component' },
      children: ['Hello Zeus!']
    })
  }
})
```

### 生命周期钩子

```typescript
import { onMounted, onUpdated, onUnmounted } from '@zeus-js/runtime-core'

onMounted(() => {
  console.log('组件已挂载')
})

onUpdated(() => {
  console.log('组件已更新')
})

onUnmounted(() => {
  console.log('组件即将卸载')
})
```

### DOM渲染

```typescript
import { renderer } from '@zeus-js/runtime-dom'

const app = renderer.createApp(MyComponent)
app.mount('#app')
```

## 开发指南

### 添加新功能

1. 在 `src/App.tsx` 中添加新的组件
2. 使用Zeus的响应式API管理状态
3. 利用生命周期钩子处理副作用

### 样式定制

所有样式都在 `index.html` 的 `<style>` 标签中，可以自由修改。

### 调试技巧

- 打开浏览器开发者工具查看控制台输出
- 使用 `console.log` 在组件中输出调试信息
- 查看Network标签确认资源加载情况

## 性能特性

- **响应式更新**: 只更新变化的部分
- **高效渲染**: 虚拟DOM diff算法
- **内存管理**: 自动垃圾回收
- **Tree Shaking**: 只打包使用的代码

## 浏览器支持

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 故障排除

### 常见问题

1. **页面空白**: 检查浏览器控制台是否有错误
2. **样式不生效**: 确认CSS选择器正确
3. **事件不响应**: 检查事件绑定语法

### 调试步骤

1. 打开浏览器开发者工具
2. 查看Console标签的错误信息
3. 检查Network标签的资源加载状态
4. 使用断点调试组件逻辑

## 相关链接

- [Zeus框架文档](../../docs)
- [Zeus编译器](../../compiler)
- [Zeus运行时](../../packages)

---

🎉 **享受使用Zeus框架的乐趣！**
