import type { CompilerOptions, BabelState } from './types'

//#region  file metadata
type ZeusMetadata = {
  config?: CompilerOptions
}

type FileMetadata = BabelState['file']['metadata'] & {
  zeus?: ZeusMetadata
}

export function getFileMetadata(state: BabelState): ZeusMetadata {
  const metadata = state.file.metadata as FileMetadata

  metadata.zeus ??= {}

  return metadata.zeus
}

//#endregion
