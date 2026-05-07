比较推荐的 **Babel 插件标准姿势** 是：

1. 插件整体返回类型用 `PluginObj<State>`
2. 插件工厂用 `declare`
3. Babel 版本用 `api.assertVersion(7)`
4. JSX 解析能力通过 `inherits: syntaxJsx`
5. visitor 拆出去，用 Babel 自己的 `Visitor<State>` 类型约束
6. 不要自己硬写一大堆 `enter/exit/path/state` 类型，优先从 Babel 类型里取

Babel 官方示例里，插件本质就是一个函数，返回包含 `visitor` 的对象；`@babel/helper-plugin-utils` 的 `declare` 也是 Babel 官方推荐给插件/预设使用的包装方式，并且可以保证 `options` 总是传入，以及 `api.assertVersion` 可用。([babeljs.io][1])

可以这样写：

```ts
import { declare } from '@babel/helper-plugin-utils'
import syntaxJsx from '@babel/plugin-syntax-jsx'

import type { PluginObj, Visitor } from '@babel/core'

export interface PluginOptions {
  // 后面你可以扩展
  // moduleName?: string
}

type PluginState = {
  opts: PluginOptions
}

type ProgramVisitor = NonNullable<Visitor<PluginState>['Program']>

function createProgramVisitor(): ProgramVisitor {
  return {
    enter(path, state) {
      // preprocess(path, state)
    },

    exit(path, state) {
      // postprocess(path, state)
    },
  }
}

function createVisitor(): Visitor<PluginState> {
  return {
    Program: createProgramVisitor(),

    // JSXElement(path, state) {
    //   transformJSX(path, state)
    // },

    // JSXFragment(path, state) {
    //   transformJSX(path, state)
    // },
  }
}

export default declare<PluginOptions>(
  (api, options): PluginObj<PluginState> => {
    api.assertVersion(7)

    return {
      name: 'babel-plugin-jsx-dom-expressions',

      // 只开启 JSX 语法解析能力
      inherits: syntaxJsx,

      visitor: createVisitor(),
    }
  },
)
```

这里有几个关键点。

`@babel/plugin-syntax-jsx` **只负责让 Babel 能解析 JSX 语法，不负责转换 JSX**。你的转换逻辑还是要自己写在 `JSXElement` / `JSXFragment` visitor 里。([babeljs.io][2])

你原来的：

```ts
inherits: SyntaxJSX.default
```

更建议改成：

```ts
inherits: syntaxJsx
```

因为你已经是：

```ts
import syntaxJsx from '@babel/plugin-syntax-jsx'
```

默认导入后通常直接用这个值就行。除非你当前构建产物确实是 CJS interop 后需要 `.default`，否则 `.default` 很容易导致类型和运行时都别扭。

如果只问你上一条那个函数的返回类型，最合适的是：

```ts
type ProgramVisitor = NonNullable<Visitor<PluginState>['Program']>
```

然后：

```ts
function createProgramVisitor(): ProgramVisitor {
  return {
    enter(path, state) {},
    exit(path, state) {},
  }
}
```

如果是整个插件的返回类型，最合适的是：

```ts
PluginObj<PluginState>
```

也就是：

```ts
export default declare<PluginOptions>(
  (api, options): PluginObj<PluginState> => {
    api.assertVersion(7)

    return {
      name: 'babel-plugin-jsx-dom-expressions',
      inherits: syntaxJsx,
      visitor: createVisitor(),
    }
  },
)
```

另外，插件设计上尽量避免在多个地方重复 `path.traverse`。Babel 插件手册里也建议尽可能合并 visitor、避免不必要的 AST 遍历，并且嵌套 visitor 尽量 hoist 出来，不要每次进入节点都新建 visitor 对象。([GitHub][3])

所以你的项目里可以按这个结构拆：

```txt
src/
  index.ts              // 插件入口
  visitor.ts            // createVisitor
  program.ts            // Program enter/exit
  transform-jsx.ts      // JSXElement / JSXFragment 转换
  types.ts              // PluginOptions / PluginState
```

最终核心思路是：

```ts
declare + PluginObj + Visitor + syntax-jsx inherits
```

这就是写 Babel 插件比较稳的姿势。

[1]: https://babeljs.io/docs/ 'What is Babel? · Babel'
[2]: https://babeljs.io/docs/babel-plugin-syntax-jsx?utm_source=chatgpt.com 'babel/plugin-syntax-jsx'
[3]: https://github.com/kentcdodds/babel-plugin-handbook 'GitHub - kentcdodds/babel-plugin-handbook: How to create Babel plugins · GitHub'
