[已进行]

- JSXElement -> template()
- JSXText -> 静态文本
- JSXExpressionContainer -> dynamic expr
- Component -> createComponent()
- transformChildren -> insert dynamic child
- 基础 CompilerError
- 基础 logger
- Vitest 快照测试

[下一步优先]

1. runtime-dom 最小实现
   - template
   - insert
   - createComponent
   - setAttr

2. transformChildren 插入位置修正
   - {expr}<span />
   - <span />{expr}
   - {a}{b}
   - 文本 + 动态 + 元素混排

3. 模板节点引用修正
   - firstChild
   - nextSibling
   - 多层嵌套节点 id
   - 避免所有子元素都指向 parent.firstChild

4. 动态属性
   - className
   - id
   - value
   - disabled
   - style 简化版
   - onClick 事件

5. 组件 children
   - 单 child
   - 多 child array
   - 文本 child
   - element child
   - dynamic child

6. 编译结果测试
   - static element
   - dynamic child
   - dynamic before static
   - static before dynamic
   - component props
   - component children
   - nested component
