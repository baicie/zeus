/**
 * Program visitor — entry and exit point for the entire transform pass.
 *
 * - Program.enter: initializes file metadata
 * - Program.exit: injects all collected codegen artifacts (templates, events, imports)
 */
import * as t from '@babel/types'

import {
  getTemplates,
  escapeStringForTemplate,
  isMathMLTemplate,
  registerImportMethod,
  getRendererConfig,
  appendEvents,
  appendImportMethods,
} from './codegen/support'
import { setZeusMetadata } from './utils'

import type { TemplateRecord } from './codegen/support'
import type {
  BabelState,
  CompilerOptions,
  BabelProgramPath,
  BabelProgramVisitor,
} from './types'

//#region program enter

function enterProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  setZeusMetadata(state, config)
}

//#endregion

//#region program exit — template injection

/**
 * Generates `var tmpl$0 = template(...), tmpl$1 = template(...)` declarations
 * and unshifts them to the top of the program.
 */
function appendTemplates(path: BabelProgramPath): void {
  const templates = getTemplates(path, 'dom')

  if (!templates.length) return

  const templateMethod = registerImportMethod(
    path,
    'template',
    getRendererConfig(path, 'dom').moduleName,
  )

  const declarators = templates.map((template: TemplateRecord) => {
    const html = template.templateWithClosingTags || template.template

    const tmpl = {
      cooked: html,
      raw: escapeStringForTemplate(html),
    }

    const shouldUseImportNode = Boolean(template.isCE || template.isImportNode)
    const isMathML = isMathMLTemplate(html)

    const args: t.Expression[] = [
      t.templateLiteral([t.templateElement(tmpl, true)], []),
    ]

    if (template.isSVG || shouldUseImportNode || isMathML) {
      args.push(
        t.booleanLiteral(shouldUseImportNode),
        t.booleanLiteral(Boolean(template.isSVG)),
        t.booleanLiteral(isMathML),
      )
    }

    return t.variableDeclarator(
      t.cloneNode(template.id),
      t.addComment(
        t.callExpression(t.cloneNode(templateMethod), args),
        'leading',
        '#__PURE__',
      ),
    )
  })

  path.node.body.unshift(t.variableDeclaration('var', declarators))
}

//#endregion

//#region program exit — orchestration

function exitProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  if (state.get('skip')) return

  appendTemplates(path)
  appendEvents(path)
  appendImportMethods(path)
}

//#endregion

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
