import type { BabelJSXSpreadChildPath } from '../types'

export function transformSpread(path: BabelJSXSpreadChildPath): never {
  throw path.buildCodeFrameError(
    'JSX spread child is not supported in Zeus MVP',
  )
}
