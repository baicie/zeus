import { CompilerError, CompilerErrorCode } from '../errors'

import type { BabelJSXSpreadChildPath } from '../types'

export function transformSpread(path: BabelJSXSpreadChildPath): never {
  throw new CompilerError({
    code: CompilerErrorCode.UNSUPPORTED_SPREAD_CHILD,
    message: 'JSX spread child is not supported in Zeus MVP.',
    path,
  })
}
