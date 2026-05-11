// import { getFileMetadata } from './unit'

import type { BabelJSXPath, BabelState, CompilerOptions } from './types'

export function transformJSX(
  path: BabelJSXPath,
  state: BabelState,
  config: CompilerOptions,
) {
  if (state.get('skip')) return

  // const metadata = getFileMetadata(state)
}
