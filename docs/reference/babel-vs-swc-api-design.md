# Babel vs SWC API 设计详尽对比

> JavaScript 生态两大主流编译器基础设施完整 API 参考

---

## 目录

- [1. Babel vs SWC 概述](#1-babel-vs-swc-概述)
- [2. Babel API 设计](#2-babel-api-设计)
- [3. SWC API 设计](#3-swc-api-设计)
- [4. AST 结构对比](#4-ast-结构对比)
- [5. 插件开发对比](#5-插件开发对比)
- [6. 性能对比](#6-性能对比)
- [7. 生态集成](#7-生态集成)
- [8. 迁移指南](#8-迁移指南)

---

## 1. Babel vs SWC 概述

### 1.1 核心定位

| 维度 | Babel | SWC |
|------|-------|-----|
| **定位** | 通用 JavaScript/JSX 编译器框架 | 高性能 JavaScript 工具链 |
| **语言** | JavaScript / TypeScript | Rust (核心) + Node.js WASM |
| **设计哲学** | 可扩展性优先 | 性能优先 |
| **成熟度** | 成熟 (2014+) | 成熟 (2019+) |
| **Star 数** | ~42k | ~30k |

### 1.2 架构对比

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Babel 架构                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  @babel/core                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │   transform(source)                                                │  │
│  │        │                                                           │  │
│  │        ▼                                                           │  │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │  │
│  │   │  @babel/    │───▶│  @babel/    │───▶│  @babel/    │          │  │
│  │   │  parser     │    │  traverse   │    │  generator   │          │  │
│  │   │  (解析)      │    │  (遍历)     │    │  (生成)      │          │  │
│  │   └─────────────┘    └─────────────┘    └─────────────┘          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│                           ┌─────────────────┐                             │
│                           │   Plugin        │                             │
│                           │   Pipeline      │                             │
│                           │                 │                             │
│                           │  Plugin1        │                             │
│                           │  Plugin2        │                             │
│                           │  Plugin3        │                             │
│                           └─────────────────┘                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              SWC 架构                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  @swc/core (Node.js / WASM)                                             │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │   parse(source)  │  transform(source)  │  print(ast)              │  │
│  │        │               │                    │                      │  │
│  │        ▼               ▼                    ▼                      │  │
│  │   ┌───────────┐   ┌───────────┐    ┌────────────┐                │  │
│  │   │  Parser   │   │ Transformer│    │  Codegen   │                │  │
│  │   │  (Rust)   │   │  (Rust)    │    │  (Rust)     │                │  │
│  │   └───────────┘   └───────────┘    └────────────┘                │  │
│  │        │               │                    │                      │  │
│  │        └───────────────┴────────────────────┘                      │  │
│  │                    WASM / Native                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│                           ┌─────────────────┐                             │
│                           │  Plugin         │                             │
│                           │  (WASM Module)  │                             │
│                           │                 │                             │
│                           │  swc_plugin!    │                             │
│                           │  (Rust Macro)   │                             │
│                           └─────────────────┘                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Babel API 设计

### 2.1 核心 API

#### 2.1.1 transformSync / transform

```javascript
const babel = require('@babel/core');

// 同步转换 (最常用)
const result = babel.transformSync(source, {
  // ─────────────────────────────────────────────────────────────────
  // 插件配置
  // ─────────────────────────────────────────────────────────────────
  plugins: [
    // 方式 1: 插件函数
    function myPlugin() {
      return {
        visitor: {
          Identifier(path) {
            path.node.name = path.node.name.replace(/^._/, '');
          }
        }
      };
    },
    
    // 方式 2: 使用配置
    ['@babel/plugin-transform-arrow-functions', { 
      noInnerRefs: true 
    }],
    
    // 方式 3: 插件选项
    ['@babel/plugin-proposal-decorators', {
      version: '2022-03'
    }],
  ],

  // ─────────────────────────────────────────────────────────────────
  // 预设
  // ─────────────────────────────────────────────────────────────────
  presets: [
    // 官方预设
    ['@babel/preset-env', {
      targets: { chrome: '100' },
      useBuiltIns: 'usage',
      corejs: 3
    }],
    '@babel/preset-react',
    '@babel/preset-typescript',
    
    // 预设选项
    ['@babel/preset-typescript', {
      isTSX: true,
      allExtensions: true
    }],
  ],

  // ─────────────────────────────────────────────────────────────────
  // 解析配置
  // ─────────────────────────────────────────────────────────────────
  parserOpts: {
    // 语法插件
    plugins: [
      'jsx',
      'typescript',
      'decorators-legacy',
      'classProperties',
      'optionalChaining',
      'nullishCoalescing',
    ],
    
    // 源码类型
    sourceType: 'module',  // 'script' | 'module' | 'unambiguous'
    
    // 插值语法
    interpolation: 'ruby',  // esm 常量插值
    
    // 注释
    attachComment: true,
    tokens: true,
    
    // 重置根作用域
    allowReturnOutsideFunction: true,
    
    // .babelrc 路径
    babelrc: true,
    babelrcPaths: ['./src', './lib'],
  },

  // ─────────────────────────────────────────────────────────────────
  // 生成配置
  // ─────────────────────────────────────────────────────────────────
  generatorOpts: {
    // 注释
    comments: true,
    compact: false,           // 'auto' | true | false
    minified: false,
    
    // 辅助函数
    auxiliaryCommentBefore: null,
    auxiliaryCommentAfter: null,
    
    // 装饰器
    decoratorsBeforeExport: true,
    recordAndTupleSyntaxType: 'hash',
    
    // 排版
    jsescapeOption: {
      minimal: true
    },
    
    // 保留标识符
    retainLines: false,
    inlineScripts: false,
  },

  // ─────────────────────────────────────────────────────────────────
  // 文件配置
  // ─────────────────────────────────────────────────────────────────
  // 文件名 (用于 Source Map 和错误报告)
  filename: 'input.js',
  filenameRelative: 'input.js',
  
  // 文件夹 (用于解析相对导入)
  cwd: process.cwd(),
  root: process.cwd(),
  
  // 输入 Source Map
  inputSourceMap: true,
  
  // 输出 Source Map
  sourceMaps: true,        // true | false | 'inline' | 'both'
  sourceMapTarget: 'input.js.map',
  sourceFileName: 'input.js',
  
  // 配置路径
  configFile: './babel.config.js',
  babelrc: true,
  envName: 'development',
  
  // 其他
  cloneInputAst: true,
  code: true,              // 是否包含生成的代码
  ast: true,               // 是否包含 AST

}, (err, result) => {
  if (err) {
    console.error(err);
  } else {
    console.log(result.code);      // 生成的代码
    console.log(result.map);       // Source Map
    console.log(result.ast);       // 完整 AST
    console.log(result.externalUpstreamRefs);  // 外部引用
  }
});
```

#### 2.1.2 transformAsync (异步)

```javascript
const babel = require('@babel/core');

// 异步转换
const result = await babel.transformAsync(source, {
  plugins: [/* ... */],
  presets: [/* ... */],
});

// 批量转换
const results = await Promise.all([
  babel.transformAsync(source1, options1),
  babel.transformAsync(source2, options2),
  babel.transformAsync(source3, options3),
]);
```

#### 2.1.3 parse / parseSync

```javascript
const babel = require('@babel/core');

// 解析为 AST
const ast = babel.parseSync(source, {
  sourceType: 'module',
  plugins: ['jsx', 'typescript'],
});

// 解析文件
const ast = babel.parseFileSync('./input.js', {
  filename: './input.js',
});
```

#### 2.1.4 generate

```javascript
const babel = require('@babel/core');
const generate = require('@babel/generator').default;

// 从 AST 生成代码
const { code, map } = generate(ast, {
  comments: true,
  compact: false,
  concise: false,
  minimal: false,
  retainLines: false,
  shouldPrintComment: (comment) => comment.value.includes('DEBUG'),
  sourceMaps: true,
  sourceFile: 'input.js',
  sourceRoot: '/src',
}, source);
```

### 2.2 Plugin API

```javascript
// my-babel-plugin.js
export default function (api, options) {
  // ─────────────────────────────────────────────────────────────────
  // api 对象
  // ─────────────────────────────────────────────────────────────────
  const { 
    // Babel 版本信息
    version,                    // "7.x.x"
    env,                       // 当前环境 "development"
    
    // 工具函数
    types: t,                  // @babel/types
    template,                  // @babel/template
    traverse,                  // @babel/traverse
    generate,                  // @babel/generator
    
    // 配置
    assertVersion,             // 验证 Babel 版本
    getEnv,                    // 获取当前环境
    
    // 缓存
    cache,                      // LRU 缓存
  } = api;

  // ─────────────────────────────────────────────────────────────────
  // assertVersion: 验证 Babel 版本
  // ─────────────────────────────────────────────────────────────────
  assertVersion('^7.0.0');     // 7.x.x
  assertVersion('^7.21.0');    // 7.21.0+
  assertVersion(7.21);         // 同上

  // ─────────────────────────────────────────────────────────────────
  // template: 代码模板
  // ─────────────────────────────────────────────────────────────────
  const buildRequire = template(`
    require('%%SOURCE%%')
  `);

  // ─────────────────────────────────────────────────────────────────
  // 返回插件对象
  // ─────────────────────────────────────────────────────────────────
  return {
    // ─────────────────────────────────────────────────────────────
    // 插件名称 (可选，用于调试)
    // ─────────────────────────────────────────────────────────────
    name: 'my-custom-plugin',
    
    // ─────────────────────────────────────────────────────────────
    // 继承其他插件
    // ─────────────────────────────────────────────────────────────
    // inherits: require('@babel/plugin-syntax-jsx'),
    inherits: function () {
      return require('@babel/plugin-syntax-jsx').default;
    },
    
    // ─────────────────────────────────────────────────────────────
    // 预设环境
    // ─────────────────────────────────────────────────────────────
    presets: [
      // 条件预设
    ],
    
    // ─────────────────────────────────────────────────────────────
    // 预设配置
    // ─────────────────────────────────────────────────────────────
    presetsConfigs: {
      // ...
    },
    
    // ─────────────────────────────────────────────────────────────
    // 操作解析选项
    // ─────────────────────────────────────────────────────────────
    manipulateOptions(options, parserOpts) {
      // 添加解析插件
      parserOpts.plugins.push('jsx');
      parserOpts.plugins.push('typescript');
      
      // 修改目标
      parserOpts.target = 2020;
    },
    
    // ─────────────────────────────────────────────────────────────
    // Visitor 模式
    // ─────────────────────────────────────────────────────────────
    visitor: {
      // ─────────────────────────────────────────────────────────
      // Program 入口
      // ─────────────────────────────────────────────────────────
      Program: {
        enter(path, state) {
          // 预处理
          // - 添加导入
          // - 修改作用域
          // - 初始化状态
          
          // path.scope 包含作用域信息
          // state.opts 包含插件选项
        },
        exit(path, state) {
          // 后处理
        }
      },
      
      // ─────────────────────────────────────────────────────────
      // Import 声明
      // ─────────────────────────────────────────────────────────
      ImportDeclaration(path, state) {
        const source = path.node.source.value;
        
        if (source === 'react') {
          // 修改导入
          path.node.source.value = 'preact/compat';
        }
      },
      
      // ─────────────────────────────────────────────────────────
      // 标识符
      // ─────────────────────────────────────────────────────────
      Identifier(path, state) {
        if (path.node.name === 'React') {
          path.node.name = 'Preact';
        }
      },
      
      // ─────────────────────────────────────────────────────────
      // JSX 元素
      // ─────────────────────────────────────────────────────────
      JSXElement(path, state) {
        // path.node 是 JSXElement 节点
        // path.replaceWith(newNode) 替换节点
        // path.remove() 删除节点
        // path.skip() 跳过子遍历
      },
      
      JSXFragment(path, state) {
        // ...
      },
      
      // ─────────────────────────────────────────────────────────
      // 表达式容器
      // ─────────────────────────────────────────────────────────
      JSXExpressionContainer(path, state) {
        const expr = path.node.expression;
        // 处理表达式
      },
      
      // ─────────────────────────────────────────────────────────
      // 调用表达式
      // ─────────────────────────────────────────────────────────
      CallExpression(path, state) {
        // 处理函数调用
      },
      
      // ─────────────────────────────────────────────────────────
      // 成员表达式
      // ─────────────────────────────────────────────────────────
      MemberExpression(path, state) {
        // 处理属性访问
      },
      
      // ─────────────────────────────────────────────────────────
      // 函数声明
      // ─────────────────────────────────────────────────────────
      FunctionDeclaration(path, state) {
        // 处理函数
      },
      
      // ─────────────────────────────────────────────────────────
      // 条件表达式
      // ─────────────────────────────────────────────────────────
      ConditionalExpression(path, state) {
        // 处理三元表达式
      },
      
      // ─────────────────────────────────────────────────────────
      // 逻辑表达式
      // ─────────────────────────────────────────────────────────
      LogicalExpression(path, state) {
        // 处理 && || 表达式
      },
      
      // ─────────────────────────────────────────────────────────
      // 数组表达式
      // ─────────────────────────────────────────────────────────
      ArrayExpression(path, state) {
        // 处理数组
      },
      
      // ─────────────────────────────────────────────────────────
      // 对象表达式
      // ─────────────────────────────────────────────────────────
      ObjectExpression(path, state) {
        // 处理对象
      },
    },
  };
}
```

### 2.3 Path API

```javascript
// Path 是 AST 节点与树结构的连接

function myPlugin() {
  return {
    visitor: {
      NodeType(path) {
        // ─────────────────────────────────────────────────────
        // 节点信息
        // ─────────────────────────────────────────────────────
        path.node          // 当前 AST 节点
        path.parent        // 父节点
        path.parentPath    // 父节点的 Path
        path.hub           // 共享状态和工具
        path.scope         // 作用域信息
        
        // ─────────────────────────────────────────────────────
        // 导航
        // ─────────────────────────────────────────────────────
        path.get('body')               // 获取子 path
        path.getSibling()              // 获取兄弟 path
        path.getAllPrevSiblings()      // 获取所有前驱兄弟
        path.getAllNextSiblings()      // 获取所有后继兄弟
        
        path.getFunctionParent()       // 获取最近的函数父节点
        path.getProgramParent()        // 获取 Program 节点
        
        // ─────────────────────────────────────────────────────
        // 类型检查
        // ─────────────────────────────────────────────────────
        path.isNodeType(type)          // 检查节点类型
        path.has(name)                  // 检查是否有属性
        path.canBeInside归一化()        // 检查是否可以内联
        
        t.isIdentifier(path.node)      // 静态检查
        t.isIdentifier(path.node, {    // 带属性检查
          name: 'foo'
        })
        
        // ─────────────────────────────────────────────────────
        // 转换操作
        // ─────────────────────────────────────────────────────
        path.replaceWith(node)           // 替换当前节点
        path.replaceWithMultiple([...])  // 替换为多个节点
        path.replaceWithSourceString(code)  // 用源码替换
        
        path.remove()                    // 删除节点
        path.insertBefore([...])         // 在前插入
        path.insertAfter([...])         // 在后插入
        
        path.skip()                     // 跳过子遍历
        path.stop()                     // 停止遍历
        
        // ─────────────────────────────────────────────────────
        // 作用域
        // ─────────────────────────────────────────────────────
        path.scope.getBinding('name')   // 获取变量绑定
        path.scope.getOwnBinding('name') // 获取自身绑定
        path.scope.hasGlobal('name')     // 是否有全局变量
        path.scope.crawl()              // 重新计算作用域
        
        path.scope.push(path.builders)  // 添加到作用域
        
        // 生成唯一标识符
        path.scope.generateUid('tmp')   // 生成 tmp, tmp1, tmp2...
        path.scope.generateUidIdentifier('tmp')
        
        // ─────────────────────────────────────────────────────
        // Traversal
        // ─────────────────────────────────────────────────────
        path.traverse(visitor)          // 遍历子节点
        path.visit()                     // 访问
        
        // 引用
        path.getBindingIdentifiers()     // 获取所有绑定标识符
        path.getOuterBindingIdentifiers()
        
        // ─────────────────────────────────────────────────────
        // 询问
        // ─────────────────────────────────────────────────────
        path.listMap(cb)                 // 映射
        
        // ─────────────────────────────────────────────────────
        // 共享信息
        // ─────────────────────────────────────────────────────
        // state.opts 插件选项
        // state.filename 文件名
        // state.file.file (AST)
        // state.env 当前环境
      }
    }
  };
}
```

### 2.4 Types API (@babel/types)

```javascript
const t = require('@babel/types');

// ─────────────────────────────────────────────────────────────────
// 创建字面量
// ─────────────────────────────────────────────────────────────────
t.numericLiteral(1)                    // 1
t.stringLiteral('hello')               // 'hello'
t.booleanLiteral(true)                 // true
t.nullLiteral()                        // null
t.regexLiteral(/test/i)                // /test/i
t.bigIntLiteral('100n')               // 100n

// ─────────────────────────────────────────────────────────────────
// 创建表达式
// ─────────────────────────────────────────────────────────────────
t.identifier('foo')                    // foo
t无名('arr', '0')                  // arr[0]
t.memberExpression(obj, prop)         // obj.prop
t.optionalMemberExpression(obj, prop)  // obj?.prop

t.callExpression(callee, args)        // callee(args)
t.optionalCallExpression(callee, args) // callee?.()

t.arrayExpression(elements)           // [elements]
t.objectExpression(properties)        // { properties }

t.binaryExpression('+', left, right)   // left + right
t.unaryExpression('!', argument)       // !argument
t.logicalExpression('&&', left, right) // left && right
t.conditionalExpression(test, cons, alt) // test ? cons : alt

t.arrowFunctionExpression(params, body) // () => body
t.functionExpression(id, params, body)  // function id() {}
t.classExpression(id, superClass, body) // class id {}

t.templateLiteral(quasis, exprs)       // `quasis ${exprs}`
t.taggedTemplateExpression(tag, tmpl)   // tag`template`

// ─────────────────────────────────────────────────────────────────
// 创建语句
// ─────────────────────────────────────────────────────────────────
t.expressionStatement(expr)            // expr;
t.blockStatement(body)                 // { body }
t.emptyStatement()                     // ;

t.returnStatement(arg)                 // return arg;
t.throwStatement(arg)                  // throw arg;
t.breakStatement(label)                // break;
t.continueStatement(label)             // continue;

t.ifStatement(test, consequent, alternate) // if () {}
t.switchStatement(discriminant, cases)     // switch {}
t.switchCase(test, consequent)             // case:

t.forStatement(init, test, update, body)  // for () {}
t.forInStatement(left, right, body)       // for (in) {}
t.forOfStatement(left, right, body)       // for (of) {}
t.whileStatement(test, body)              // while () {}
t.doWhileStatement(body, test)            // do {} while ()

t.tryStatement(block, handler, finalizer) // try {} catch {}
t.catchClause(param, body)                // catch (param) {}

t.labeledStatement(label, body)          // label: body
t.withStatement(object, body)            // with (obj) {}

// ─────────────────────────────────────────────────────────────────
// 创建声明
// ─────────────────────────────────────────────────────────────────
t.variableDeclaration(kind, declarations) // let/const/var
t.variableDeclarator(id, init)           // id = init

t.functionDeclaration(id, params, body)   // function id() {}
t.classDeclaration(id, superClass, body)  // class id {}

t.exportNamedDeclaration(specifiers)      // export { foo }
t.exportDefaultDeclaration(declaration)   // export default
t.exportAllDeclaration(source)            // export * from

t.importDeclaration(specifiers, source)  // import {}
t.importSpecifier(local, imported)        // { imported }
t.importDefaultSpecifier(local)           // { default }
t.importNamespaceSpecifier(local)         // { * as foo }

// ─────────────────────────────────────────────────────────────────
// 创建 JSX
// ─────────────────────────────────────────────────────────────────
t.jsxElement(openingElement, closingElement, children)
t.jsxFragment(openingFragment, closingFragment, children)
t.jsxOpeningElement(name, attributes, selfClosing)
t.jsxClosingElement(name)
t.jsxAttribute(name, value)
t.jsxExpressionContainer(expression)
t.jsxSpreadChild(expression)
t.jsxSpreadAttribute(argument)

// ─────────────────────────────────────────────────────────────────
// 类型检查 (静态)
// ─────────────────────────────────────────────────────────────────
t.isNode(node)                           // 是否是 AST 节点
t.isIdentifier(node)                    // 是否是标识符
t.isNumericLiteral(node)                 // 是否是数字
t.isStringLiteral(node)                 // 是否是字符串
t.isBooleanLiteral(node)                // 是否是布尔
t.isNullLiteral(node)                   // 是否是 null
t.isUndefined(node)                     // 是否是 undefined

t.isArrayExpression(node)               // 是否是数组
t.isObjectExpression(node)              // 是否是对象
t.isFunctionExpression(node)            // 是否是函数
t.isArrowFunctionExpression(node)        // 是否是箭头函数
t.isClassExpression(node)               // 是否是类表达式

t.isCallExpression(node)                // 是否是调用
t.isMemberExpression(node)              // 是否是成员访问
t.isBinaryExpression(node)              // 是否是二元运算
t.isLogicalExpression(node)            // 是否是逻辑运算

t.isConditionalExpression(node)         // 是否是三元
t.isIfStatement(node)                   // 是否是 if

t.isJSXElement(node)                    // 是否是 JSX 元素
t.isJSXFragment(node)                   // 是否是 JSX Fragment

// 带属性的检查
t.isIdentifier(node, { name: 'foo' })
t.isCallExpression(node, { optional: false })

// ─────────────────────────────────────────────────────────────────
// 克隆
// ─────────────────────────────────────────────────────────────────
t.cloneNode(node)                        // 浅克隆
t.cloneDeep(node)                        // 深克隆
```

### 2.5 Template API

```javascript
const template = require('@babel/template');

const buildVar = template(`
  var %%NAME%% = %%VALUE%%;
`);

const result = buildVar({
  NAME: t.identifier('x'),
  VALUE: t.numericLiteral(1),
});
// 结果: var x = 1;

// ─────────────────────────────────────────────────────────────────
// 模板类型
// ─────────────────────────────────────────────────────────────────
template.program(statements)      // 程序模板
template.expression(code)          // 表达式模板
template.statements(code)         // 语句模板
template.supertype(code)          // 自动检测

// ─────────────────────────────────────────────────────────────────
// 选项
// ─────────────────────────────────────────────────────────────────
const buildExport = template(`
  export { %%specs%% } from '%%source%%';
`, {
  plugins: [],                    // 解析插件
  syntactic: false,               // 使用完整解析
  placeholderPattern: /%%([\s\S]+?)%%/,  // 占位符模式
  preserveComments: false,        // 保留注释
});

// ─────────────────────────────────────────────────────────────────
// 完整示例
// ─────────────────────────────────────────────────────────────────
const t = require('@babel/types');

const buildClass = template(`
  class %%NAME%% %%EXTENDS%% {
    constructor%%PARAMS%%%%BODY%%
  }
`);

const ast = buildClass({
  NAME: t.identifier('MyClass'),
  EXTENDS: t.superClass ? t.classExtends(t.identifier('MyBase')) : null,
  PARAMS: t.params ? t.parenthesizedExpression(t.params) : null,
  BODY: t.body ? t.blockStatement(t.body) : null,
});
```

### 2.6 traverse API

```javascript
const traverse = require('@babel/traverse');

// ─────────────────────────────────────────────────────────────────
// 遍历 AST
// ─────────────────────────────────────────────────────────────────
traverse(ast, {
  enter(path) {
    console.log('进入:', path.node.type);
  },
  exit(path) {
    console.log('离开:', path.node.type);
  }
}, scope, state);

// 或使用 visitor 对象
traverse(ast, {
  Identifier(path) {
    console.log(path.node.name);
  }
});

// ─────────────────────────────────────────────────────────────────
// 访问特定节点
// ─────────────────────────────────────────────────────────────────
traverse(ast, {
  // JSX
  JSXElement(path) { },
  JSXFragment(path) { },
  JSXAttribute(path) { },
  JSXOpeningElement(path) { },
  JSXClosingElement(path) { },
  JSXExpressionContainer(path) { },
  JSXSpreadChild(path) { },
  JSXSpreadAttribute(path) { },
  
  // 表达式
  Identifier(path) { },
  CallExpression(path) { },
  MemberExpression(path) { },
  BinaryExpression(path) { },
  UnaryExpression(path) { },
  LogicalExpression(path) { },
  ConditionalExpression(path) { },
  
  // 语句
  FunctionDeclaration(path) { },
  VariableDeclaration(path) { },
  IfStatement(path) { },
  ForStatement(path) { },
  SwitchStatement(path) { },
  
  // 声明
  ImportDeclaration(path) { },
  ExportDeclaration(path) { },
  ClassDeclaration(path) { },
});

// ─────────────────────────────────────────────────────────────────
// 作用域
// ─────────────────────────────────────────────────────────────────
traverse(ast, {
  Identifier(path) {
    // 获取绑定
    const binding = path.scope.getBinding(path.node.name);
    
    if (binding) {
      console.log('绑定:', binding.path.node.type);
      console.log('引用数:', binding.references);
      console.log('是否常量:', binding.constant);
      console.log('作用域:', path.scope.path.node.type);
    }
  }
});
```

---

## 3. SWC API 设计

### 3.1 Node.js API (@swc/core)

#### 3.1.1 parse

```javascript
const { parse } = require('@swc/core');

// ─────────────────────────────────────────────────────────────────
// 基本解析
// ─────────────────────────────────────────────────────────────────
const ast = await parse(source, {
  // ─────────────────────────────────────────────────────────────
  // 语法配置
  // ─────────────────────────────────────────────────────────────
  syntax: 'ecmascript',  // 'ecmascript' | 'typescript'
  
  // ECMAScript 特定
  target: 'es2020',
  
  // ─────────────────────────────────────────────────────────────
  // JSX 配置
  // ─────────────────────────────────────────────────────────────
  jsx: {
    // 是否解析 JSX
    parseFrag: 'react',   // 'react' | 'vue'
    
    // 命名空间
    throwOnNamespace: true,
    
    // 开发模式
    development: false,
    
    // 是否全局模式 (不导入 React)
    isGlobal: false,
    
    // React pragma
    pragma: 'React.createElement',
    pragmaFrag: 'React.Fragment',
    pragmaReact: 'React',
    
    // React 17+ 新的 JSX 转换
    importSource: 'react',
    
    // 使用运行时
    runtime: 'automatic',  // 'classic' | 'automatic'
    
    // 启用 Pure 注释
    pure: ['React.createElement'],
  },
  
  // ─────────────────────────────────────────────────────────────
  // TypeScript 配置
  // ─────────────────────────────────────────────────────────────
  tsx: false,            // 是否解析为 TSX
  decorators: true,      // 启用装饰器
  dts: false,            // 解析 .d.ts 文件
  
  // ─────────────────────────────────────────────────────────────
  // 其他选项
  // ─────────────────────────────────────────────────────────────
  comments: true,        // 保留注释
  script: true,          // 解析为脚本 (非模块)
  
  // 引用配置
  resolvePlugin: (specifier) => {
    // 解析插件
  },
  resolvePreset: (specifier) => {
    // 解析预设
  },
});

// 返回值
console.log(ast.type);           // 'Module' | 'Script'
console.log(ast.body);           // 语句数组
console.log(ast.comments);        // 注释数组
console.log(ast.span);           // 源码范围
```

#### 3.1.2 transform

```javascript
const { transform } = require('@swc/core');

// ─────────────────────────────────────────────────────────────────
// 基本转换
// ─────────────────────────────────────────────────────────────────
const result = await transform(source, {
  // ─────────────────────────────────────────────────────────────
  // 文件信息
  // ─────────────────────────────────────────────────────────────
  filename: 'input.js',
  filenameRelative: 'input.js',
  sourceFileName: 'input.js',
  sourceRoot: '/src',
  
  // ─────────────────────────────────────────────────────────────
  // 配置来源
  // ─────────────────────────────────────────────────────────────
  configFile: './.swcrc',
  swcrc: true,               // 读取 .swcrc
  swcrcRoots: ['./src'],     // .swcrc 查找目录
  
  // ─────────────────────────────────────────────────────────────
  // 插件
  // ─────────────────────────────────────────────────────────────
  plugin: (m) => {
    // m 是 Module AST
    // 返回转换后的 AST
    return m;
  },
  
  // ─────────────────────────────────────────────────────────────
  // 插件 (WASM)
  // ─────────────────────────────────────────────────────────────
  plugin: fs.readFileSync('./plugin.wasm'),
  
  // ─────────────────────────────────────────────────────────────
  // JSC 配置
  // ─────────────────────────────────────────────────────────────
  jsc: {
    // ─────────────────────────────────────────────────────────
    // 解析器配置
    // ─────────────────────────────────────────────────────────
    parser: {
      syntax: 'typescript',
      tsx: true,
      decorators: true,
      
      // 动态导入
      dynamicImport: true,
      
      // 保留注释
      comments: true,
      
      // JSX 配置
      jsx: {
        pragma: 'React.createElement',
        pragmaFrag: 'React.Fragment',
        importSource: 'react',
        runtime: 'automatic',
        pure: ['React.createElement'],
        development: false,
        throwOnNamespace: false,
      },
      
      // TypeScript
      tsx: true,
      bind: true,
      types: true,
    },
    
    // ─────────────────────────────────────────────────────────
    // 转换配置
    // ─────────────────────────────────────────────────────────
    transform: {
      // React 转换
      react: {
        runtime: 'automatic',  // 'classic' | 'automatic'
        development: false,
        refresh: true,         // React Fast Refresh
        useBuiltins: true,
        
        // pragma
        pragma: 'React.createElement',
        pragmaFrag: 'React.Fragment',
        pragmaReact: 'React',
        importSource: 'react',
        
        // 过滤
        filterJsxProp: null,
        
        // Pure 注释
        pure: 'React.createElement',
      },
      
      // TypeScript 转换
      ts: {
        // 类型剥离
        dsx: false,
        strict: false,
        // ...
      },
      
      // optimizer
      optimizer: {
        globals: {
          // 全局内联
          modules: ['react', 'react-dom'],
        },
      },
      
      // legacy decorator
      legacyDecorator: false,
      decoratorMetadata: false,
    },
    
    // ─────────────────────────────────────────────────────────
    // 目标环境
    // ─────────────────────────────────────────────────────────
    target: 'es2020',          // 'es3' ~ 'es2022' | 'chrome' | 'firefox' | ...
    
    // 或指定多个目标
    targets: {
      chrome: '80',
      firefox: '75',
      safari: '13',
      edge: '80',
      node: '14',
    },
    
    // ─────────────────────────────────────────────────────────
    // Minify 配置
    // ─────────────────────────────────────────────────────────
    minify: false,
    minifyOptions: {
      compress: {
        unused: true,
        deadcode: true,
      },
      mangle: {
        // ...
      },
      format: {
        // ...
      },
    },
    
    // ─────────────────────────────────────────────────────────
    // 实验性
    // ─────────────────────────────────────────────────────────
    loose: false,               // 松散模式
    externalHelpers: false,      // 外部辅助函数
    requireConfig: false,       // 需要 tsconfig
    
    // 是否保留类型
    keepJsx: false,
    
    // 直接将 helpers 内联
    injectHelpers: true,
    
    // 使用 esnext 模块
    esModuleInterop: true,
    allowDeclareFields: false,
    protectJsxInjectionsFromCommonJS: false,
  },
  
  // ─────────────────────────────────────────────────────────────
  // 模块配置
  // ─────────────────────────────────────────────────────────────
  module: {
    // ─────────────────────────────────────────────────────────
    // 模块类型
    // ─────────────────────────────────────────────────────────
    type: 'commonjs',   // 'es6' | 'commonjs' | 'amd' | 'umd' | 'systemjs'
    
    // ─────────────────────────────────────────────────────────
    // CommonJS 特定
    // ─────────────────────────────────────────────────────────
    commonjs: {
      // 全局犀牛别名
      globals: '__commonjsHelpers',
      
      // 懒导入
      lazy: false,
      
      // 专门插件
      namedImports: false,
      
      // strict 模式
      strictMode: true,
      
      // 无默认导出时仍创建
      noInterop: false,
    },
    
    // ─────────────────────────────────────────────────────────
    // AMD 特定
    // ─────────────────────────────────────────────────────────
    amd: {
      define: 'define',
    },
  },
  
  // ─────────────────────────────────────────────────────────────
  // Source Map
  // ─────────────────────────────────────────────────────────────
  sourceMaps: true,              // true | false | 'inline' | 'both'
  inlineSourcesContent: true,
  sourceMapTarget: 'input.js.map',
  
  // ─────────────────────────────────────────────────────────────
  // 输出
  // ─────────────────────────────────────────────────────────────
  outputPath: 'output.js',
  
  // ─────────────────────────────────────────────────────────────
  // 环境
  // ─────────────────────────────────────────────────────────────
  env: {
    targets: {},
    mode: 'usage',
    coreJs: 3,
  },
  
  // ─────────────────────────────────────────────────────────────
  // 缓存
  // ─────────────────────────────────────────────────────────────
  cache: true,
  cacheDirectory: './node_modules/.cache/swc',
  
  // ─────────────────────────────────────────────────────────────
  // 错误
  // ─────────────────────────────────────────────────────────────
  // 带行号错误
  errorRecovery: false,
  
  // 铺助错误
  logLevel: 'warn',     // 'silent' | 'fatal' | 'warn' | 'info' | 'debug' | 'verbose'
});

// 结果
console.log(result.code);        // 生成的代码
console.log(result.map);         // Source Map
console.log(result.ast);         // 完整 AST
console.log(result.externalHelpers);  // 是否使用外部辅助函数
console.log(result.extractedComments);  // 提取的注释
```

#### 3.1.3 transformFile

```javascript
const { transformFile } = require('@swc/core');

// 转换文件
const result = await transformFile('./input.tsx', {
  jsc: {
    parser: {
      syntax: 'typescript',
      tsx: true,
    },
  },
});
```

#### 3.1.4 print

```javascript
const { parse, print } = require('@swc/core');

// 解析
const ast = await parse(source, {
  syntax: 'typescript',
  tsx: true,
});

// 打印 AST
const { code, map } = await print(ast, {
  sourceMap: true,
  inlineSourcesContent: true,
  emitAttributes: false,
  target: 'es2020',
});
```

#### 3.1.5 minify

```javascript
const { minify } = require('@swc/core');

// 压缩代码
const result = await minify(source, {
  compress: {
    unused: true,
    deadcode: true,
    collapseLocalVariables: true,
    collapseBoolean: true,
    numericLiterals: true,
    typeToString: true,
    replace: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    passes: 2,
    pure_getters: true,
    unsafe_comps: true,
    unsafe_math: true,
    unsafe_methods: true,
  },
  mangle: {
    safari10: true,
    properties: {
      // ...
    },
  },
});
```

### 3.2 WASM API (@swc/wasm-web)

```javascript
import init, { parse, transform, print } from '@swc/wasm-web';

// ─────────────────────────────────────────────────────────────────
// 初始化
// ─────────────────────────────────────────────────────────────────
await init();  // 或指定 WASM 路径
await init('/path/to/swc_wasm.wasm');

// ─────────────────────────────────────────────────────────────────
// parse
// ─────────────────────────────────────────────────────────────────
const ast = parse(source, {
  syntax: 'typescript',
  tsx: true,
  target: 'es2020',
});

// ─────────────────────────────────────────────────────────────────
// transform
// ─────────────────────────────────────────────────────────────────
const result = await transform(source, {
  filename: 'input.tsx',
  jsc: {
    parser: {
      syntax: 'typescript',
      tsx: true,
    },
    transform: {
      react: {
        runtime: 'automatic',
      },
    },
  },
  module: {
    type: 'es6',
  },
});
```

### 3.3 Rust Plugin API

```rust
// swc_plugin 宏
use swc_plugin::{plugin_transform, TransformPluginOptions};
use swc_ecma_ast::*;
use swc_ecma_visit::{Visit, VisitWith, Fold, FoldWith};

#[plugin_transform]
pub fn process_transform(program: Program, opts: TransformPluginOptions) -> Program {
    // opts 是 JSON 格式的插件选项
    
    // 使用 Fold 模式转换
    program.fold_with(&mut JsxTransformer::new(opts))
}

// ─────────────────────────────────────────────────────────────────
// Fold 模式 (转换)
// ─────────────────────────────────────────────────────────────────
struct JsxTransformer {
    config: JsxTransformConfig,
}

impl JsxTransformer {
    pub fn new(opts: TransformPluginOptions) -> Self {
        Self {
            config: serde_json::from_value(opts.0).unwrap_or_default(),
        }
    }
}

impl Fold<JsxElement> for JsxTransformer {
    fn fold(&mut self, elem: JsxElement) -> JsxElement {
        // 转换逻辑
        let elem = elem.fold_children_with(self);
        
        // 自定义转换
        // ...
        
        elem
    }
}

impl Fold<JsxFragment> for JsxTransformer {
    fn fold(&mut self, frag: JsxFragment) -> JsxFragment {
        // 处理 Fragment
        frag.fold_children_with(self)
    }
}

impl Fold<CallExpr> for JsxTransformer {
    fn fold(&mut self, expr: CallExpr) -> CallExpr {
        // 处理函数调用
        expr.fold_children_with(self)
    }
}

// ─────────────────────────────────────────────────────────────────
// Visit 模式 (只读遍历)
// ─────────────────────────────────────────────────────────────────
struct JsxAnalyzer {
    element_count: usize,
}

impl JsxAnalyzer {
    fn new() -> Self {
        Self { element_count: 0 }
    }
}

impl Visit for JsxAnalyzer {
    fn visit_jsx_element(&mut self, elem: &JsxElement) {
        self.element_count += 1;
        elem.children.iter().visit_with(self);
    }
    
    fn visit_jsx_fragment(&mut self, frag: &JsxFragment) {
        frag.children.iter().visit_with(self);
    }
}
```

### 3.4 SWC AST 节点类型

```rust
// swc_ecma_ast::ast

// ─────────────────────────────────────────────────────────────────
// 模块
// ─────────────────────────────────────────────────────────────────
Program          // 程序 (Module 或 Script)
Module           // ES 模块
Script           // 脚本

// ─────────────────────────────────────────────────────────────────
// 声明
// ─────────────────────────────────────────────────────────────────
ModuleDecl       // 模块声明
ModuleItem       // 模块项
ImportDecl       // 导入声明
ImportSpecifier  // 导入说明符
ExportDecl       // 导出声明
ExportSpecifier  // 导出说明符

// ─────────────────────────────────────────────────────────────────
// 语句
// ─────────────────────────────────────────────────────────────────
Stmt             // 语句
BlockStmt        // 代码块
ExprStmt         // 表达式语句
IfStmt           // if 语句
SwitchStmt       // switch 语句
ForStmt          // for 语句
ForInStmt        // for-in 语句
ForOfStmt        // for-of 语句
WhileStmt        // while 语句
DoWhileStmt      // do-while 语句
WithStmt         // with 语句
ReturnStmt       // return 语句
ThrowStmt        // throw 语句
BreakStmt        // break 语句
ContinueStmt     // continue 语句
LabeledStmt      // 标签语句
TryStmt          // try 语句

// ─────────────────────────────────────────────────────────────────
// 表达式
// ─────────────────────────────────────────────────────────────────
Expr             // 表达式
Identifier        // 标识符
StringLiteral     // 字符串字面量
NumericLiteral    // 数字字面量
BooleanLiteral    // 布尔字面量
NullLiteral       // null 字面量
RegExpLiteral     // 正则字面量
BigIntLiteral     // BigInt 字面量

ArrayExpr         // 数组表达式
ObjectExpr        // 对象表达式
ArrowExpr         // 箭头函数
FunctionExpr      // 函数表达式
ClassExpr         // 类表达式

CallExpr          // 调用表达式
NewExpr           // new 表达式
MemberExpr        // 成员表达式
Super             // super
ThisExpr          // this

UpdateExpr        // 更新表达式 (++ --)
UnaryExpr         // 一元表达式 (! - + ~ typeof void)
BinaryExpr        // 二元表达式 (+ - * / % ** | & ^ << >> >>>)
LogicalExpr       // 逻辑表达式 (&& || ??)
CondExpr          // 条件表达式 (?:)
AssignExpr        // 赋值表达式 (= += -= ...)

YieldExpr         // yield 表达式
AwaitExpr         // await 表达式
ChainExpr         // 可选链表达式
TaggedTpl         // 标签模板

TemplateLit       // 模板字面量
TplElement        // 模板元素
SpreadElement     // 展开元素

// ─────────────────────────────────────────────────────────────────
// JSX
// ─────────────────────────────────────────────────────────────────
JsxElement        // JSX 元素
JsxFragment       // JSX Fragment
JsxOpeningElement // JSX 开始标签
JsxClosingElement // JSX 结束标签
JsxAttr           // JSX 属性
JsxAttrExprContainer // JSX 表达式容器
JsxSpreadChild    // JSX 展开子节点
JsxText           // JSX 文本
```

### 3.5 SWC Visit/Fold API

```rust
// swc_ecma_visit

// ─────────────────────────────────────────────────────────────────
// Visit trait (只读遍历)
// ─────────────────────────────────────────────────────────────────
trait Visit {
    // 通用
    fn visit_module(&mut self, n: &Module) { n.visit_children_with(self); }
    fn visit_program(&mut self, n: &Program) { n.visit_children_with(self); }
    
    // 语句
    fn visit_stmt(&mut self, n: &Stmt) { n.visit_children_with(self); }
    fn visit_expr(&mut self, n: &Expr) { n.visit_children_with(self); }
    
    // JSX
    fn visit_jsx_element(&mut self, n: &JsxElement) {
        n.opening.visit_with(self);
        n.children.visit_with(self);
        if let Some(c) = &n.closing {
            c.visit_with(self);
        }
    }
    
    fn visit_jsx_fragment(&mut self, n: &JsxFragment) {
        n.opening.visit_with(self);
        n.children.visit_with(self);
        n.closing.visit_with(self);
    }
}

// ─────────────────────────────────────────────────────────────────
// Fold trait (转换)
// ─────────────────────────────────────────────────────────────────
trait Fold {
    // 默认实现返回自身
    fn fold_module(&mut self, n: Module) -> Module { n.fold_children_with(self) }
    fn fold_jsx_element(&mut self, n: JsxElement) -> JsxElement {
        JsxElement {
            opening: self.fold(n.opening),
            children: self.fold(n.children),
            closing: self.fold(n.closing),
            ..n
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// 实用方法
// ─────────────────────────────────────────────────────────────────
// visit_children_with 遍历子节点
node.visit_children_with(self);

// fold_children_with 转换子节点
node.fold_children_with(self);

// ─────────────────────────────────────────────────────────────────
// 常用方法
// ─────────────────────────────────────────────────────────────────
// 遍历 Vec
vec.visit_with(self);
self.fold_vec(vec);

// 遍历 Option
opt.visit_with(self);
self.fold_opt(opt);

// 遍历 HashMap
map.visit_with(self);

// ─────────────────────────────────────────────────────────────────
// 自定义遍历
// ─────────────────────────────────────────────────────────────────
struct CustomVisitor;

impl Visit for CustomVisitor {
    fn visit_jsx_element(&mut self, elem: &JsxElement) {
        // 跳过 children 遍历
        elem.opening.visit_with(self);
        // ...
    }
}
```

---

## 4. AST 结构对比

### 4.1 Babel AST vs SWC AST

| 节点类型 | Babel | SWC |
|---------|-------|-----|
| 程序 | `File` | `Program` (Module/Script) |
| 标识符 | `Identifier` | `Ident` |
| 数字 | `NumericLiteral` | `Number` |
| 字符串 | `StringLiteral` | `Str` |
| 函数 | `FunctionExpression` | `Function` |
| 类 | `ClassExpression` | `Class` |
| 调用 | `CallExpression` | `CallExpr` |
| JSX元素 | `JSXElement` | `JsxElement` |

### 4.2 节点结构对比

#### Babel

```javascript
{
  type: "FunctionDeclaration",
  id: {
    type: "Identifier",
    name: "foo"
  },
  params: [
    {
      type: "Identifier",
      name: "x"
    }
  ],
  body: {
    type: "BlockStatement",
    body: []
  },
  generator: false,
  async: false,
  // ...
}
```

#### SWC

```rust
struct Function {
    ident: Ident,
    params: Vec<Param>,
    body: Option<BlockStmt>,
    decorator: Vec<Decorator>,
    span: Span,
    // ...
}
```

---

## 5. 插件开发对比

### 5.1 Babel 插件

```javascript
// babel-plugin-jsx-dom-expressions
export default function (api, options) {
  const { types: t } = api;
  
  return {
    name: "jsx-dom-expressions",
    inherits: require("@babel/plugin-syntax-jsx").default,
    
    visitor: {
      Program: {
        enter(path, state) {
          // 预处理
        },
        exit(path, state) {
          // 后处理
        }
      },
      
      JSXElement(path, state) {
        const result = transformElement(path, state);
        path.replaceWithMultiple(result.nodes);
      },
      
      JSXFragment(path, state) {
        // ...
      }
    }
  };
}
```

### 5.2 SWC Rust 插件

```rust
#[plugin_transform]
pub fn plugin_transform(program: Program, opts: TransformPluginOptions) -> Program {
    program.fold_with(&mut MyTransform::default())
}

#[derive(Default)]
struct MyTransform;

impl Fold<JsxElement> for MyTransform {
    fn fold(&mut self, elem: JsxElement) -> JsxElement {
        // 转换逻辑
        elem.fold_children_with(self)
    }
}
```

### 5.3 SWC JavaScript Plugin

```javascript
// 使用 plugin 选项
const result = await swc.transform(source, {
  plugin: (ast) => {
    // ast 是 Module AST
    
    // 修改 AST
    for (const stmt of ast.body) {
      // ...
    }
    
    // 返回修改后的 AST
    return ast;
  }
});
```

---

## 6. 性能对比

### 6.1 基准测试

| 操作 | Babel | SWC | 提升 |
|------|-------|-----|------|
| **解析 1MB JS** | ~800ms | ~40ms | 20x |
| **解析 1MB TS** | ~1200ms | ~60ms | 20x |
| **解析 1MB JSX** | ~1000ms | ~50ms | 20x |
| **转换 1MB JS** | ~2000ms | ~150ms | 13x |
| **内存占用** | ~300MB | ~100MB | 3x |

### 6.2 优化策略

#### Babel

```javascript
// 缓存 AST
babel.transformSync(code, {
  // 缓存
});

// 只编译改变的部分
babel.configOnly();
```

#### SWC

```javascript
// 内置缓存
await swc.transform(code, {
  cache: true,
  cacheDirectory: './node_modules/.cache/swc',
});

// 增量编译
await swc.transformFiles(['./src/**/*.ts'], {
  // ...
});
```

---

## 7. 生态集成

### 7.1 主流工具集成

| 工具 | Babel | SWC |
|------|-------|-----|
| **Webpack** | babel-loader | swc-loader |
| **Vite** | @vitejs/plugin-babel | @originjs/vite-plugin-swc |
| **Rollup** | @rollup/plugin-babel | @rollup/plugin-swc |
| **Next.js** | 支持 | SWC 原生 |
| **Parcel** | babel-plugin | @parcel/plugin-swс |
| **Jest** | babel-jest | SWC 内置 |
| **ESLint** | @babel/eslint-parser | @swc/eslint-parser |

### 7.2 Vite 集成

```javascript
// Vite + Babel
import babel from '@vitejs/plugin-babel';

export default {
  plugins: [
    babel({
      plugins: [/* ... */],
      presets: [/* ... */],
    })
  ]
};

// Vite + SWC
import swc from '@originjs/vite-plugin-swc';

export default {
  plugins: [
    swc({
      plugin: (m) => { /* ... */ },
      jsc: {
        parser: { syntax: 'typescript', tsx: true },
        transform: { react: { runtime: 'automatic' } },
      },
    })
  ]
};
```

---

## 8. 迁移指南

### 8.1 Babel → SWC 迁移检查表

| 检查项 | 说明 |
|--------|------|
| 插件列表 | 确认哪些 Babel 插件有 SWC 版本 |
| 配置转换 | `babel.config.js` → `.swcrc` |
| 插件重写 | 自定义插件需用 Rust 重写 |
| 兼容性 | 测试运行结果是否一致 |

### 8.2 配置映射

| Babel | SWC |
|-------|-----|
| `@babel/preset-env` | `jsc.target` |
| `@babel/preset-react` | `jsc.transform.react` |
| `@babel/preset-typescript` | `jsc.parser.typescript` |
| `plugin-transform-runtime` | `jsc.externalHelpers` |

### 8.3 API 映射

| Babel | SWC |
|-------|-----|
| `babel.transformSync()` | `swc.transform()` |
| `babel.parseSync()` | `swc.parse()` |
| `babel.generate()` | `swc.print()` |
| `path.replaceWith()` | Fold 模式 |
| `path.traverse()` | Visit 模式 |

---

## 附录 A：常用 Babel 插件

| 插件 | 功能 |
|------|------|
| `@babel/plugin-syntax-jsx` | JSX 语法支持 |
| `@babel/plugin-transform-react-jsx` | React JSX 转换 |
| `@babel/plugin-proposal-decorators` | 装饰器 |
| `@babel/plugin-proposal-class-properties` | 类属性 |
| `@babel/plugin-transform-runtime` | 运行时辅助 |

## 附录 B：常用 SWC 配置

```json
// .swcrc
{
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "tsx": true,
      "decorators": true
    },
    "transform": {
      "react": {
        "runtime": "automatic",
        "development": false
      }
    },
    "target": "es2020"
  },
  "module": {
    "type": "commonjs"
  }
}
```
