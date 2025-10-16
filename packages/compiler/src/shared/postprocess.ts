import * as t from '@babel/types'
import { getRendererConfig, registerImportMethod } from './utils'
import { appendTemplates as appendTemplatesDOM } from '../dom/template'
import { appendTemplates as appendTemplatesSSR } from '../ssr/template'
import { isInvalidMarkup } from './validate.js'
import type { NodePathHub, TransformState } from '../type'

// add to the top/bottom of the module.
export default (path: NodePathHub<t.Program>, state: unknown): void => {
  const s = state as TransformState
  if (s.skip) return

  if (path.scope.data.events && t.isProgram(path.node)) {
    path.node.body.push(
      t.expressionStatement(
        t.callExpression(
          registerImportMethod(
            path,
            'delegateEvents',
            getRendererConfig(path, 'dom').moduleName,
          ),
          [
            t.arrayExpression(
              Array.from((path.scope as any).data.events).map(e =>
                t.stringLiteral(e as string),
              ),
            ),
          ],
        ),
      ),
    )
  }
  if ((path.scope.data.templates as any)?.length) {
    if (path.hub.file?.metadata.config.validate) {
      for (const template of path.scope.data.templates as any) {
        const html = template.templateWithClosingTags
        // not sure when/why this is not a string
        if (typeof html === 'string') {
          const result = isInvalidMarkup(html)
          if (result) {
            const message =
              '\nThe HTML provided is malformed and will yield unexpected output when evaluated by a browser.\n'
            console.warn(message)
            console.warn('User HTML:\n', result.html)
            console.warn('Browser HTML:\n', result.browser)
            console.warn('Original HTML:\n', html)
            // throw path.buildCodeFrameError();
          }
        }
      }
    }
    let domTemplates = (path.scope.data.templates as any).filter(
      (temp: any) => temp.renderer === 'dom',
    )
    let ssrTemplates = (path.scope.data.templates as any).filter(
      (temp: any) => temp.renderer === 'ssr',
    )
    domTemplates.length > 0 && appendTemplatesDOM(path, domTemplates)
    ssrTemplates.length > 0 && appendTemplatesSSR(path, ssrTemplates)
  }
}
