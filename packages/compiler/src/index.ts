import { declare } from '@babel/helper-plugin-utils'
import syntaxJsx from '@babel/plugin-syntax-jsx'

import { resolveConfig, type CompilerOptions } from './config'
import { createVisitor } from './visitor'

import type { BabelPlugin } from './types'

export default declare<CompilerOptions>((api, options): BabelPlugin => {
  api.assertVersion(7)

  const config = resolveConfig(options)

  return {
    name: 'babel-plugin-zeus-compiler',
    inherits: syntaxJsx,
    visitor: createVisitor(config),
  }
})

export type { CompilerOptions } from './config'
