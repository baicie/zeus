import { extend } from '@zeus-js/shared'

import type { BabelState, CompilerOptions } from '../types'

type ZeusMetadata = {
  config?: CompilerOptions
}

type FileMetadata = BabelState['file']['metadata'] & {
  zeus: ZeusMetadata
}

export function setZeusMetadata(
  state: BabelState,
  config: CompilerOptions,
): ZeusMetadata {
  const metadata = state.file.metadata as FileMetadata

  metadata.zeus = extend({}, metadata.zeus, {
    config,
  })

  return metadata.zeus
}

export function getZeusMetadata(state: BabelState): ZeusMetadata {
  const metadata = state.file.metadata as FileMetadata
  return metadata.zeus
}
