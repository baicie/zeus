// @ts-nocheck
import * as t from '@babel/types'
import {
  escapeStringForTemplate,
  getConfig,
  getNumberedId,
  getRendererConfig,
  registerImportMethod,
} from '../shared/utils'
import { setAttr } from './element'

export function createTemplate(_path: any, result: any): t.Expression {
  const path = _path
  if (result.id) {
    registerTemplate(path, result)
    if (
      !(
        result.exprs.length ||
        result.dynamics.length ||
        result.postExprs.length
      ) &&
      result.decl.declarations.length === 1
    ) {
      return result.decl.declarations[0].init
    }
    return t.callExpression(
      t.arrowFunctionExpression(
        [],
        t.blockStatement([
          result.decl,
          ...result.exprs.concat(
            wrapDynamics(path, result.dynamics) || [],
            result.postExprs || [],
          ),
          t.returnStatement(result.id),
        ]),
      ),
      [],
    )
  }
  return result.exprs[0] || t.identifier('undefined')
}

export function appendTemplates(path: any, templates: any[]): void {
  const declarators = templates.map(template => {
    const tmpl = {
      cooked: template.template,
      raw: escapeStringForTemplate(template.template),
    }
    const shouldUseImportNode = template.isCE || template.isImportNode
    const isMathML =
      /^<(math|annotation|annotation-xml|maction|math|merror|mfrac|mi|mmultiscripts|mn|mo|mover|mpadded|mphantom|mprescripts|mroot|mrow|ms|mspace|msqrt|mstyle|msub|msubsup|msup|mtable|mtd|mtext|mtr|munder|munderover|semantics|menclose|mfenced)(\s|>)/.test(
        template.template,
      )
    return t.variableDeclarator(
      template.id,
      t.addComment(
        t.callExpression(
          registerImportMethod(
            path,
            'template',
            getRendererConfig(path, 'dom').moduleName,
          ),
          [t.templateLiteral([t.templateElement(tmpl, true)], [])].concat(
            template.isSVG || shouldUseImportNode || isMathML
              ? [
                  t.booleanLiteral(Boolean(shouldUseImportNode)),
                  t.booleanLiteral(Boolean(template.isSVG)),
                  t.booleanLiteral(Boolean(isMathML)),
                ]
              : [],
          ),
        ),
        'leading',
        '#__PURE__',
      ),
    )
  })
  path.node.body.unshift(t.variableDeclaration('var', declarators))
}

function registerTemplate(path: any, results: any): void {
  const hydratable = getConfig(path).hydratable
  let decl
  if (results.template.length) {
    let templateDef
    let templateId
    if (!results.skipTemplate) {
      const templates =
        path.scope.getProgramParent().data.templates ||
        (path.scope.getProgramParent().data.templates = [])
      templateDef = templates.find((x: any) => x.template === results.template)
      if (templateDef) templateId = templateDef.id
      else {
        templateId = path.scope.generateUidIdentifier('tmpl$')
        templates.push({
          id: templateId,
          template: results.template,
          templateWithClosingTags: results.templateWithClosingTags,
          isSVG: results.isSVG,
          isCE: results.hasCustomElement,
          isImportNode: results.isImportNode,
          renderer: 'dom',
        })
      }
    }
    decl = t.variableDeclarator(
      results.id,
      hydratable
        ? t.callExpression(
            registerImportMethod(
              path,
              'getNextElement',
              getRendererConfig(path, 'dom').moduleName,
            ),
            templateId ? [templateId] : [],
          )
        : t.callExpression(templateId, []),
    )
  }
  results.declarations.unshift(decl)
  results.decl = t.variableDeclaration('var', results.declarations)
}

function wrapDynamics(
  path: any,
  dynamics: any[],
): t.ExpressionStatement | undefined {
  if (!dynamics.length) return
  const config = getConfig(path)
  const effectWrapperId = registerImportMethod(path, config.effectWrapper)
  if (dynamics.length === 1) {
    const prevValue =
      dynamics[0].key === 'classList' ||
      dynamics[0].key === 'style' ||
      dynamics[0].key.indexOf('style:') === 0
        ? t.identifier('_$p')
        : undefined
    return t.expressionStatement(
      t.callExpression(effectWrapperId, [
        t.arrowFunctionExpression(
          prevValue ? [prevValue] : [],
          setAttr(path, dynamics[0].elem, dynamics[0].key, dynamics[0].value, {
            isSVG: dynamics[0].isSVG,
            isCE: dynamics[0].isCE,
            tagName: dynamics[0].tagName,
            dynamic: true,
            prevId: prevValue,
          }),
        ),
      ]),
    )
  }
  const prevId = t.identifier('_p$')
  const declarations: t.VariableDeclarator[] = []
  const statements: t.ExpressionStatement[] = []
  const properties: t.Identifier[] = []
  dynamics.forEach(({ elem, key, value, isSVG, isCE, tagName }, index) => {
    const varIdent = path.scope.generateUidIdentifier('v$')
    const propIdent = t.identifier(getNumberedId(index))
    const propMember = t.memberExpression(prevId, propIdent)
    properties.push(propIdent)
    declarations.push(t.variableDeclarator(varIdent, value))
    statements.push(
      t.expressionStatement(
        t.logicalExpression(
          '&&',
          t.binaryExpression('!==', varIdent, propMember),
          setAttr(
            path,
            elem,
            key,
            t.assignmentExpression('=', propMember, varIdent),
            {
              isSVG,
              isCE,
              tagName,
              dynamic: true,
              prevId: propMember,
            },
          ),
        ),
      ),
    )
  })
  return t.expressionStatement(
    t.callExpression(effectWrapperId, [
      t.arrowFunctionExpression(
        [prevId],
        t.blockStatement([
          t.variableDeclaration('var', declarations),
          ...statements,
          t.returnStatement(prevId),
        ]),
      ),
      t.objectExpression(
        properties.map(id => t.objectProperty(id, t.identifier('undefined'))),
      ),
    ]),
  )
}
