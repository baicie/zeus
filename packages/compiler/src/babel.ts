import type { PluginItem } from '@babel/core'
import type { PluginContext } from 'rollup'
import jsxTransform from 'babel-plugin-jsx-dom-expressions'
import template from '@babel/template'
import type { ComponentMeta } from '@zeus/output'
import { extractPropsFromType } from './utils'

export interface JSXPluginOptions {
  mode?: 'dom' | 'ssr'
  dev?: boolean
}

export function createJSXPlugin(options: JSXPluginOptions = {}): PluginItem[] {
  const components: ComponentMeta[] = []
  let context: PluginContext

  return [
    [
      jsxTransform,
      {
        moduleName: '@zeus/core',
        builtIns: [
          'For',
          'Show',
          'Switch',
          'Match',
          'Suspense',
          'SuspenseList',
          'Portal',
          'Index',
          'Dynamic',
          'ErrorBoundary',
        ],
        contextToCustomElements: true,
        wrapConditionals: true,
        generate: options.mode || 'dom',
        dev: options.dev ?? process.env.NODE_ENV !== 'production',
      },
    ],
    {
      name: 'zeus-component-transform',

      // 保存 context
      api: {
        setPluginContext(ctx: PluginContext) {
          context = ctx
        },
      },

      visitor: {
        FunctionDeclaration(path: any) {
          const decorators = path.node.decorators || []
          const componentDecorator = decorators.find(
            (d: any) => d.expression.callee.name === 'Component'
          )

          if (componentDecorator) {
            const options = componentDecorator.expression.arguments[0]
            const shadowProp = options.properties.find(
              (p: any) => p.key.name === 'shadow'
            )
            const shadow = shadowProp ? shadowProp.value.value : false

            // 收集组件信息
            const meta: ComponentMeta = {
              tagName: options.properties.find((p: any) => p.key.name === 'tag')
                .value.value,
              className: path.node.id.name,
              properties: [],
              events: [],
              methods: [],
            }

            // 收集 props 类型
            const propsParam = path.node.params[0]
            if (propsParam && propsParam.typeAnnotation) {
              meta.properties = extractPropsFromType(propsParam.typeAnnotation)
            }

            // 收集事件
            path.traverse({
              CallExpression(callPath: any) {
                if (callPath.node.callee.name === 'useEvent') {
                  meta.events.push({
                    name: callPath.node.arguments[0].value,
                    eventName: callPath.node.arguments[0].value,
                  })
                }
              },
            })

            components.push(meta)

            // 收集 hooks 调用
            const refs = new Map()
            const events = new Map()

            path.traverse({
              CallExpression(callPath: any) {
                const callee = callPath.node.callee
                if (callee.name === 'useRef') {
                  // 收集 ref 声明
                  const refType =
                    callPath.node.typeParameters &&
                    callPath.node.typeParameters.params[0]
                  const refName =
                    callPath.node.arguments[0] &&
                    callPath.node.arguments[0].value
                  refs.set(refName, {
                    type: refType,
                    name: refName,
                  })
                } else if (callee.name === 'useEvent') {
                  // 收集事件处理器
                  const eventName =
                    callPath.node.arguments[0] &&
                    callPath.node.arguments[0].value
                  const handler = callPath.node.arguments[1]
                  events.set(eventName, {
                    name: eventName,
                    handler: handler,
                  })
                }
              },
            })

            // 转换为类
            path.replaceWith(
              template.statement(`
              class %%name%% extends ZeusElement {
                constructor() {
                  super(%%shadow%%)
                }

                ${Array.from(events)
                  .map(
                    ([key, event]) => `
                  private _${key}(e) {
                    ${event.handler}
                    this._emit('${event.name}', e)
                  }
                `
                  )
                  .join('\n')}

                connectedCallback() {
                  const result = ${path.node.id.name}(this)
                  ${Array.from(refs)
                    .map(
                      ([key, ref]) => `
                    this._setRef('${ref.name}', result.querySelector('[ref="${ref.name}"]'))
                  `
                    )
                    .join('\n')}
                  this._root.appendChild(result)
                }
              }
              customElements.define(%%tag%%, %%name%%)
            `)({
                name: path.node.id.name,
                shadow: shadow,
                tag: options.properties.find((p: any) => p.key.name === 'tag')
                  .value.value,
              })
            )
          }
        },
      },

      // 使用 context.emitFile
      generateBundle() {
        context.emitFile({
          type: 'asset',
          fileName: 'components.json',
          source: JSON.stringify(components, null, 2),
        })
      },
    },
  ]
}
