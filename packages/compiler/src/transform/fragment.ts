import { CompilerError, CompilerErrorCode } from '../errors'

import type { BabelJSXFragmentPath } from '../types'

export function transformFragment(path: BabelJSXFragmentPath): never {
  throw new CompilerError({
    code: CompilerErrorCode.UNSUPPORTED_FRAGMENT,
    message: 'JSXFragment is not supported in Zeus MVP.',
    path,
    hint: 'Use a single root element instead, for example <div>...</div>.',
  })
}
