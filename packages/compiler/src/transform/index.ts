import { transformNode } from './transformNode'
import { logger } from '../utils'

import type { BabelJSXPath, BabelState } from '../utils/types'

export function transformJSX(path: BabelJSXPath, state: BabelState) {
  if (state.get('skip')) return

  // const metadata = getZeusMetadata(state)
  const result = transformNode(path, state)

  if (result) {
    logger.info(result)
  }
}
