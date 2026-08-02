import { sourceSpanFromBabelNode } from './expression'
import { CompilerError } from '../../diagnostics'

import type { CompilerErrorOptions } from '../../diagnostics/CompilerError'
import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'

type BabelCompilerErrorOptions = Omit<CompilerErrorOptions, 'filename' | 'span'>

type BabelHubWithFile = {
  file?: {
    opts?: {
      filename?: string
    }
  }
}

export function createBabelCompilerError(
  path: NodePath<t.Node>,
  options: BabelCompilerErrorOptions,
): CompilerError {
  const hub = path.hub as BabelHubWithFile | undefined

  return new CompilerError({
    ...options,
    filename: hub?.file?.opts?.filename,
    span: sourceSpanFromBabelNode(path.node),
  })
}
