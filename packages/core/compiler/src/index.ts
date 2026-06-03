import { declare } from '@babel/helper-plugin-utils'

import { resolveConfig, type CompilerOptions } from './config'
import { createVisitor } from './visitor'

import type { BabelPlugin } from './types'

type ParserPlugin = string | [string, ...unknown[]]

function hasParserPlugin(
  plugins: readonly ParserPlugin[],
  name: string,
): boolean {
  return plugins.some(
    plugin => (Array.isArray(plugin) ? plugin[0] : plugin) === name,
  )
}

export default declare<CompilerOptions>((api, options): BabelPlugin => {
  api.assertVersion(7)

  const config = resolveConfig(options)

  return {
    name: 'babel-plugin-zeus-compiler',

    manipulateOptions(
      _opts: unknown,
      parserOpts: { plugins?: ParserPlugin[] },
    ) {
      parserOpts.plugins ??= []

      if (!hasParserPlugin(parserOpts.plugins, 'jsx')) {
        parserOpts.plugins.push('jsx')
      }
    },

    visitor: createVisitor(config),
  }
})

export type { CompilerOptions } from './config'
