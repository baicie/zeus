import * as t from '@babel/types'
import { getRendererConfig, registerImportMethod } from './utils'
import { appendTemplates as appendTemplatesDOM } from '../dom/template'
import { appendTemplates as appendTemplatesSSR } from '../ssr/template'
import { isInvalidMarkup } from './validate'

export default function postprocess(path: any, state: any): void {
  if (state.skip) return

  if (path.scope.data.events) {
    path.node.body.push(
      t.expressionStatement(
        t.callExpression(
          registerImportMethod(path, 'delegateEvents', getRendererConfig(path, 'dom').moduleName),
          [t.arrayExpression(Array.from(path.scope.data.events).map((e: string) => t.stringLiteral(e)))],
        ),
      ),
    )
  }

  if (path.scope.data.templates?.length) {
    if (path.hub.file.metadata.config.validate) {
      for (const template of path.scope.data.templates) {
        const html = template.templateWithClosingTags
        if (typeof html === 'string') {
          const result = isInvalidMarkup(html)
          if (result) {
            console.warn('\nThe HTML provided is malformed and will yield unexpected output when evaluated by a browser.\n')
            console.warn('User HTML:\n', result.html)
            console.warn('Browser HTML:\n', result.browser)
            console.warn('Original HTML:\n', html)
          }
        }
      }
    }
    const domTemplates = path.scope.data.templates.filter((temp: any) => temp.renderer === 'dom')
    const ssrTemplates = path.scope.data.templates.filter((temp: any) => temp.renderer === 'ssr')
    if (domTemplates.length > 0) appendTemplatesDOM(path, domTemplates)
    if (ssrTemplates.length > 0) appendTemplatesSSR(path, ssrTemplates)
  }
}
