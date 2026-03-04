# Zeus 条件表达式和列表渲染测试

本项目用于测试 Zeus 编译器的以下特性：

1. **三元运算符条件渲染** (`TernaryComponent.tsx`)
2. **逻辑与运算符** (`LogicalAndComponent.tsx`)
3. **.map() 列表渲染** (`ListComponent.tsx`)
4. **综合测试** (`CombinedComponent.tsx`)
5. **复杂条件表达式** (`ComplexConditionComponent.tsx`)

## 使用方法

### 安装依赖

```bash
cd playground/conditional-demo
pnpm install
```

### 运行编译

```bash
pnpm dev
```

### 查看编译结果

编译后的文件将输出到 `dist/` 目录。

## 测试文件说明

| 文件 | 测试内容 |
|------|----------|
| `TernaryComponent.tsx` | 三元运算符 `condition ? true : false` |
| `LogicalAndComponent.tsx` | 逻辑与 `condition && <Element />` |
| `ListComponent.tsx` | 列表渲染 `.map()` |
| `CombinedComponent.tsx` | 组合使用所有特性 |
| `ComplexConditionComponent.tsx` | 复杂条件表达式 |
