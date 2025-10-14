import type { PluginPass } from '@babel/core'
import type { NodePath } from '@babel/traverse'
import type {
  CallExpression,
  JSXElement,
  JSXFragment,
  Program,
} from '@babel/types'
import { declare } from '@babel/helper-plugin-utils'
import * as t from '@babel/types'
import type { CompilerOptions } from './types'
import { transformJSX } from './transform'

/**
 * 创建 DOM 编译器
 * 参考 dom-expressions 的设计理念
 */
export function createDOMCompiler(options: CompilerOptions = {}): any {
  const defaultOptions: Required<CompilerOptions> = {
    moduleName: '@zeus-js/runtime-dom',
    generateSourceMap: true,
    optimizeTemplates: true,
    inlineExpressions: true,
    isCustomElement: () => false,
    webComponentsMode: 'auto',
    ...options,
  }

  return declare((api: any, options: CompilerOptions) => {
    api.assertVersion(7)

    return {
      name: 'zeus-jsx-compiler',
      visitor: {
        Program: {
          enter(path: NodePath<Program>, state: PluginPass) {
            // 初始化编译器状态
            state.set('templates', new Map())
            state.set('imports', new Set())
            state.set('templateCounter', 0)
            state.set('options', defaultOptions)
          },
          exit(path: NodePath<Program>, state: PluginPass) {
            // 添加必要的导入
            addRuntimeImports(path, state)
          },
        },

        JSXElement: {
          enter(path: NodePath<JSXElement>, state: PluginPass) {
            // 跳过已经在处理中的 JSX 元素
            if (path.node._zeusProcessed) return

            try {
              // 转换 JSX 元素
              const result = transformJSX(path, state)
              if (result) {
                path.replaceWith(result)
                path.node._zeusProcessed = true
              }
            } catch (error) {
              console.error('Error transforming JSX element:', error)
              throw error
            }
          },
        },

        JSXFragment: {
          enter(path: NodePath<JSXFragment>, state: PluginPass) {
            // 处理 JSX Fragment
            if (path.node._zeusProcessed) return

            try {
              const result = transformFragment(path, state)
              if (result) {
                path.replaceWith(result)
                path.node._zeusProcessed = true
              }
            } catch (error) {
              console.error('Error transforming JSX Fragment:', error)
              throw error
            }
          },
        },
      },
    }
  })
}

/**
 * 转换 JSX Fragment
 */
function transformFragment(
  path: NodePath<JSXFragment>,
  state: PluginPass,
): CallExpression | null {
  const { children } = path.node

  if (children.length === 0) {
    // 空 Fragment
    return t.callExpression(
      t.memberExpression(
        t.identifier('document'),
        t.identifier('createDocumentFragment'),
      ),
      [],
    )
  }

  if (children.length === 1) {
    // 单个子元素，直接返回
    const child = children[0]
    if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      return transformJSX(path.get('children.0') as NodePath<JSXElement>, state)
    }
  }

  // 多个子元素，创建 DocumentFragment
  const fragmentVar = path.scope.generateUidIdentifier('fragment')
  const statements: any[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        fragmentVar,
        t.callExpression(
          t.memberExpression(
            t.identifier('document'),
            t.identifier('createDocumentFragment'),
          ),
          [],
        ),
      ),
    ]),
  ]

  // 添加子元素
  children.forEach((child, index) => {
    const childPath = path.get(`children.${index}`)
    if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      const transformed = transformJSX(childPath as NodePath<JSXElement>, state)
      if (transformed) {
        statements.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(fragmentVar, t.identifier('appendChild')),
              [transformed],
            ),
          ),
        )
      }
    } else if (t.isJSXExpressionContainer(child)) {
      // 处理表达式
      if (child.expression && !t.isJSXEmptyExpression(child.expression)) {
        statements.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(fragmentVar, t.identifier('appendChild')),
              [child.expression],
            ),
          ),
        )
      }
    } else if (t.isJSXText(child)) {
      // 处理文本节点
      const text = child.value.trim()
      if (text) {
        statements.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(fragmentVar, t.identifier('appendChild')),
              [
                t.callExpression(
                  t.memberExpression(
                    t.identifier('document'),
                    t.identifier('createTextNode'),
                  ),
                  [t.stringLiteral(text)],
                ),
              ],
            ),
          ),
        )
      }
    }
  })

  statements.push(t.returnStatement(fragmentVar))

  // 创建 IIFE
  return t.callExpression(
    t.arrowFunctionExpression([], t.blockStatement(statements)),
    [],
  )
}

/**
 * 添加运行时导入
 */
function addRuntimeImports(path: NodePath<Program>, state: PluginPass) {
  const options = state.get('options') as Required<CompilerOptions>
  const imports = state.get('imports') as Set<string>

  if (imports.size === 0) return

  const importSpecifiers = Array.from(imports).map(name =>
    t.importSpecifier(t.identifier(name), t.identifier(name)),
  )

  const importDeclaration = t.importDeclaration(
    importSpecifiers,
    t.stringLiteral(options.moduleName),
  )

  // 在文件开头添加导入
  path.unshiftContainer('body', importDeclaration)
}

// 扩展 Babel 类型以支持自定义属性
declare module '@babel/types' {
  interface JSXElement {
    _zeusProcessed?: boolean
  }
  interface JSXFragment {
    _zeusProcessed?: boolean
  }
}
