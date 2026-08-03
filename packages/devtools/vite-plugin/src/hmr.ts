import type { PluginAPI, PluginObject } from '@babel/core'

const renderSources = new Set(['@zeus-js/runtime-dom', '@zeus-js/zeus'])

export function createRootHMRPlugin(api: PluginAPI): PluginObject {
  const t = api.types
  type Identifier = ReturnType<typeof t.identifier>
  type BabelNode = Parameters<typeof t.isCallExpression>[0]

  function createHMRBoundary(disposers: Identifier[]) {
    const disposeCalls = [...disposers]
      .reverse()
      .map(disposer =>
        t.expressionStatement(t.callExpression(t.cloneNode(disposer), [])),
      )

    return api.template.statement.ast`
      if (import.meta.hot) {
        import.meta.hot.accept()
        import.meta.hot.dispose(() => {
          ${disposeCalls}
        })
      }
    `
  }

  return {
    name: 'babel-plugin-zeus-vite-root-hmr',
    visitor: {
      Program: {
        exit(programPath) {
          const renderNames = new Set<string>()
          const bodyPaths = programPath.get('body')

          for (const statementPath of bodyPaths) {
            const statement = statementPath.node

            if (
              !t.isImportDeclaration(statement) ||
              !renderSources.has(statement.source.value)
            ) {
              continue
            }

            for (const specifier of statement.specifiers) {
              if (
                !t.isImportSpecifier(specifier) ||
                !t.isIdentifier(specifier.imported, { name: 'render' })
              ) {
                continue
              }

              renderNames.add(specifier.local.name)
            }
          }

          if (renderNames.size === 0 || hasManualHMRBoundary()) return

          const disposers: Identifier[] = []
          const isRenderCall = (value: BabelNode): boolean => {
            if (!t.isCallExpression(value) || !t.isIdentifier(value.callee)) {
              return false
            }

            return renderNames.has(value.callee.name)
          }

          for (const statementPath of bodyPaths) {
            const statement = statementPath.node

            if (
              t.isExpressionStatement(statement) &&
              isRenderCall(statement.expression)
            ) {
              const disposer =
                programPath.scope.generateUidIdentifier('dispose')

              statementPath.replaceWith(
                t.variableDeclaration('const', [
                  t.variableDeclarator(disposer, statement.expression),
                ]),
              )
              disposers.push(disposer)
              continue
            }

            const declaration = t.isVariableDeclaration(statement)
              ? statement
              : t.isExportNamedDeclaration(statement) &&
                  t.isVariableDeclaration(statement.declaration)
                ? statement.declaration
                : undefined

            if (!declaration) continue

            for (const declarator of declaration.declarations) {
              if (
                t.isIdentifier(declarator.id) &&
                isRenderCall(declarator.init)
              ) {
                disposers.push(declarator.id)
              }
            }
          }

          if (disposers.length > 0) {
            programPath.pushContainer('body', createHMRBoundary(disposers))
          }

          function hasManualHMRBoundary(): boolean {
            let found = false

            programPath.traverse({
              MemberExpression(memberPath) {
                if (memberPath.matchesPattern('import.meta.hot')) {
                  found = true
                  memberPath.stop()
                }
              },
            })

            return found
          }
        },
      },
    },
  }
}
