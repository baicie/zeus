import { declare } from '@babel/helper-plugin-utils'
import type { PluginObj } from '@babel/core'
import { analyzeComponent } from './component-analyzer'
import { transformComponent } from './jsx-to-ir'
import { generateComponentCode } from './ir-to-js'

export default declare((api): PluginObj => {
  api.assertVersion(7)

  return {
    name: 'zeus-compiler-babel',
    visitor: {
      Program(path: any, state: any) {
        let changed = false

        path.traverse({
          FunctionDeclaration(fnPath: any) {
            if (!analyzeComponent(fnPath)) return

            const ir = transformComponent(fnPath, state)
            const next = generateComponentCode(fnPath, ir, state)
            fnPath.replaceWith(next)
            changed = true
          },

          VariableDeclarator(varPath: any) {
            const init = varPath.get('init')
            if (
              !init.isArrowFunctionExpression() &&
              !init.isFunctionExpression()
            )
              return
            if (!analyzeComponent(init)) return

            const ir = transformComponent(init, state)
            const next = generateComponentCode(init, ir, state)

            init.replaceWith(next as any)
            changed = true
          },
        })

        if (changed) {
          // Inject runtime imports
          injectRuntimeImports(path, state)
        }
      },
    },
  }
})

function injectRuntimeImports(path: any, state: any): void {
  const imports = new Set<string>()

  // Collect needed imports from state
  const neededImports = state.neededHelpers || []

  if (neededImports.length > 0) {
    const importDeclaration = path.node.body.find(
      (node: any) => node.type === 'ImportDeclaration' &&
        node.source.value === '@zeusjs/runtime-dom'
    )

    if (!importDeclaration) {
      const specifiers = neededImports.map((name: string) => ({
        type: 'ImportSpecifier',
        imported: { type: 'Identifier', name },
        local: { type: 'Identifier', name },
      }))

      path.node.body.unshift({
        type: 'ImportDeclaration',
        specifiers,
        source: { type: 'StringLiteral', value: '@zeusjs/runtime-dom' },
      })
    }
  }
}
