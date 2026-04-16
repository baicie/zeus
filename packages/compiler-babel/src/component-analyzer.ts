// Component analyzer - determines if a function is a Zeus component

import { analyzeJSXElement } from '@zeusjs/compiler-shared'

export function analyzeComponent(fnPath: any): boolean {
  const parentId = fnPath.parentPath?.node?.id || fnPath.node.id
  const name = parentId?.name

  // Must have a name
  if (!name) return false

  // Component names must start with uppercase
  if (!/^[A-Z]/.test(name)) return false

  // Check for JSX return
  let hasJSXReturn = false

  fnPath.traverse({
    ReturnStatement(retPath: any) {
      const arg = retPath.get('argument')
      if (arg.isJSXElement() || arg.isJSXFragment()) {
        hasJSXReturn = true
        retPath.stop()
      }
    },
  })

  return hasJSXReturn
}

export function analyzeComponentProps(fnPath: any): string[] {
  const params = fnPath.node.params || []
  if (params.length === 0) return []

  const propsParam = params[0]
  if (!propsParam) return []

  if (propsParam.type === 'Identifier') {
    return [propsParam.name]
  }

  if (propsParam.type === 'ObjectPattern') {
    return propsParam.properties.map((prop: any) => prop.key.name)
  }

  return []
}

export function isAsyncComponent(fnPath: any): boolean {
  return fnPath.node.async === true
}

export function isMemoizedComponent(fnPath: any): boolean {
  const parent = fnPath.parentPath?.node
  return parent?.type === 'VariableDeclarator' &&
         parent.id?.type === 'Identifier' &&
         parent.init === fnPath.node
}
