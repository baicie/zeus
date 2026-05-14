import type { BabelJSXFragmentPath } from '../types'

export function transformFragment(path: BabelJSXFragmentPath): never {
  throw path.buildCodeFrameError('JSXFragment is not supported in Zeus MVP')
}
