import type { PluginItem } from '@babel/core'
import type { PluginContext } from 'rollup'

import type { ComponentMeta } from '@zeus.js/output'
export interface JSXPluginOptions {
  mode?: 'dom' | 'ssr'
  dev?: boolean
}

export function createJSXPlugin(options: JSXPluginOptions = {}): PluginItem {
  const components: ComponentMeta[] = []
  let context: PluginContext

  return {
    name: 'zeus-component-transform',

    api: {
      setPluginContext(ctx: PluginContext) {
        context = ctx
      },
    },

    visitor: {
      ClassDeclaration(path: any) {
        const decorators = path.node.decorators || []
        const componentDecorator = decorators.find(
          (d: any) => d.expression.callee.name === 'Component'
        )

        if (componentDecorator) {
          // 收集组件信息
          const meta: ComponentMeta = {
            tagName: componentDecorator.expression.arguments[0].properties.find(
              (p: any) => p.key.name === 'tag'
            ).value.value,
            className: path.node.id.name,
            properties: [],
            events: [],
            methods: [],
          }

          // 收集属性装饰器
          path.traverse({
            ClassProperty(propPath: any) {
              const propDecorator = (propPath.node.decorators || []).find(
                (d: any) => d.expression.callee.name === 'Prop'
              )
              if (propDecorator) {
                meta.properties.push({
                  name: propPath.node.key.name,
                  // eslint-disable-next-line no-restricted-syntax
                  type: propPath.node.typeAnnotation?.typeAnnotation.type.replace(
                    'TS',
                    ''
                  ),
                })
              }
            },

            // 收集事件装饰器
            ClassMethod(methodPath: any) {
              const eventDecorator = (methodPath.node.decorators || []).find(
                (d: any) => d.expression.callee.name === 'Event'
              )
              if (eventDecorator) {
                meta.events.push({
                  name: methodPath.node.key.name,
                  eventName:
                    // eslint-disable-next-line no-restricted-syntax
                    eventDecorator.expression.arguments[0]?.value ||
                    methodPath.node.key.name,
                })
              }
            },
          })

          components.push(meta)
        }
      },
    },

    generateBundle() {
      context.emitFile({
        type: 'asset',
        fileName: 'components.json',
        source: JSON.stringify(components, null, 2),
      })
    },
  }
}
