# dom-expressions 参考文档索引

本目录存放从 dom-expressions（SolidJS 编译器的核心实现）参考借鉴的分析文档。

## 文档列表

| 文档                                                   | 对应函数                    | 行号               | MVP 必须    |
| ------------------------------------------------------ | --------------------------- | ------------------ | ----------- |
| [transformElement](./transformElement.md)              | `transformElement`          | 62-205             | ✅          |
| [transformAttributes](./transformAttributes.md)        | `transformAttributes`       | 332-1019           | ✅          |
| [evaluateAndInline](./evaluateAndInline.md)            | `evaluateAndInline`         | 451-480 (utils.js) | ❌ (优化项) |
| [transformChildren](./transformChildren.md)            | `transformChildren`         | 1039-1270+         | ✅          |
| [../transform-jsx-steps.md](../transform-jsx-steps.md) | `transformJSX` 三步核心流程 | -                  | ✅          |

## 总体策略

### MVP 阶段必须实现

1. **transformElement**：解析 tagName、初始化 results、调用子处理器
2. **transformAttributes**：静态属性内联、事件绑定、动态属性调用
3. **transformChildren**：递归处理子节点、合并编译结果

### MVP 阶段可选（优化项）

- **evaluateAndInline**：编译期常量折叠，减少运行时计算

### MVP 阶段暂不实现

- Spread 展开（`{...props}`）
- classList 展开
- 多个 class 合并
- event delegation（事件委托）
- effect wrapper
- hydratable / SSR 相关
- 精细化闭合标签优化

## 参考原则

1. **先跑通，再优化**：MVP 只实现最小功能，确保编译流程能跑起来
2. **分块实现**：每个函数独立实现，避免一次性抄完
3. **保留扩展空间**：数据结构设计时预留字段，后续可逐步填入
