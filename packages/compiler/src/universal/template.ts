import * as t from '@babel/types'
import { getConfig, getNumberedId, registerImportMethod } from '../shared/utils'
import { setAttr } from './element'
import type { NodePathHub, TransformResult } from '../type'

export function createTemplate(
  path: NodePathHub,
  result: TransformResult,
  wrap: boolean,
): any {
  const config = getConfig(path)
  if (result.id) {
    result.decl = t.variableDeclaration('var', result.declarations as any)
    if (
      !(
        result.exprs.length ||
        result.dynamics?.length ||
        result.postExprs?.length
      ) &&
      result.decl.declarations.length === 1
    ) {
      return result.decl.declarations[0].init
    } else {
      return t.callExpression(
        t.arrowFunctionExpression(
          [],
          t.blockStatement([
            result.decl,
            ...result.exprs.concat(
              wrapDynamics(path, result.dynamics!) || [],
              result.postExprs || [],
            ),
            t.returnStatement(result.id),
          ] as any),
        ),
        [],
      )
    }
  }
  if (wrap && result.dynamic && config.memoWrapper) {
    return t.callExpression(registerImportMethod(path, config.memoWrapper), [
      result.exprs[0] as any,
    ])
  }
  return result.exprs[0]
}

function wrapDynamics(
  path: NodePathHub,
  dynamics: t.Expression[],
): t.ExpressionStatement | undefined {
  if (!dynamics.length) return
  const config = getConfig(path)

  const effectWrapperId = registerImportMethod(path, config.effectWrapper)

  if (dynamics.length === 1) {
    const prevValue = t.identifier('_$p')
    const firstDynamic = dynamics[0] as any
    return t.expressionStatement(
      t.callExpression(effectWrapperId, [
        t.arrowFunctionExpression(
          [prevValue],
          setAttr(
            path,
            firstDynamic.elem,
            firstDynamic.key,
            firstDynamic.value,
            {
              dynamic: true,
              prevId: prevValue,
            },
          ),
        ),
      ]),
    )
  }

  const prevId = t.identifier('_p$')

  const declarations: t.VariableDeclarator[] = []
  const statements: t.ExpressionStatement[] = []
  const properties: t.Identifier[] = []

  dynamics.forEach(({ elem, key, value }: any, index) => {
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
          t.assignmentExpression(
            '=',
            propMember,
            setAttr(path, elem, key, varIdent, {
              dynamic: true,
              prevId: propMember,
            }),
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
