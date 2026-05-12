// import * as t from '@babel/types'

import { setZeusMetadata } from './unit'

import type {
  BabelState,
  CompilerOptions,
  BabelProgramPath,
  BabelProgramVisitor,
} from './types'

/**
 * Called when the program is first visited.
 * initializes the metadata for the file.
 */
function enterProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  setZeusMetadata(state, config)
}

/**
 * Called when the program is finished being visited.
 * validates the templates and appends the templates to the program.
 */
function exitProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  if (state.get('skip')) return

  // if (path.scope.data.events) {
  //   path.node.body.push(
  //     t.expressionStatement(
  //       t.callExpression(
  //         registerImportMethod(
  //           path,
  //           'delegateEvents',
  //           getRendererConfig(path, 'dom').moduleName,
  //         ),
  //         [
  //           t.arrayExpression(
  //             Array.from(path.scope.data.events).map(e => t.stringLiteral(e)),
  //           ),
  //         ],
  //       ),
  //     ),
  //   )
  // }
  // if (path.scope.data.templates?.length) {
  //   if (path.hub.file.metadata.config.validate) {
  //     for (const template of path.scope.data.templates) {
  //       const html = template.templateWithClosingTags
  //       // not sure when/why this is not a string
  //       if (typeof html === 'string') {
  //         const result = isInvalidMarkup(html)
  //         if (result) {
  //           const message =
  //             '\nThe HTML provided is malformed and will yield unexpected output when evaluated by a browser.\n'
  //           console.warn(message)
  //           console.warn('User HTML:\n', result.html)
  //           console.warn('Browser HTML:\n', result.browser)
  //           console.warn('Original HTML:\n', html)
  //           // throw path.buildCodeFrameError();
  //         }
  //       }
  //     }
  //   }
  //   let domTemplates = path.scope.data.templates.filter(
  //     temp => temp.renderer === 'dom',
  //   )
  //   let ssrTemplates = path.scope.data.templates.filter(
  //     temp => temp.renderer === 'ssr',
  //   )
  //   domTemplates.length > 0 && appendTemplatesDOM(path, domTemplates)
  //   ssrTemplates.length > 0 && appendTemplatesSSR(path, ssrTemplates)
  // }
}

export function createProgramVisitor(
  config: CompilerOptions,
): BabelProgramVisitor {
  return {
    enter(path, state) {
      enterProgram(config, path, state)
    },

    exit(path, state) {
      exitProgram(config, path, state)
    },
  }
}
