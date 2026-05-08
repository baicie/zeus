import type {
  BabelState,
  CompilerOptions,
  BabelProgramPath,
  BabelProgramVisitor,
} from './types'
import type { PluginPass } from '@babel/core'

type ZeusMetadata = {
  config?: CompilerOptions
}

type FileMetadata = PluginPass['file']['metadata'] & {
  zeus?: ZeusMetadata
}

function getFileMetadata(state: BabelState): ZeusMetadata {
  const metadata = state.file.metadata as FileMetadata

  metadata.zeus ??= {}

  return metadata.zeus
}

function enterProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  const metadata = getFileMetadata(state)

  metadata.config = config
}

function exitProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  if (state.get('skip')) return

  // postprocess(path, state, config)
}

export function createProgramVisitor(
  config: CompilerOptions,
): BabelProgramVisitor {
  return {
    enter(path, state) {
      enterProgram(config, path, state)
    },

    exit(path, state) {
      exitProgram(config, path, state)
    },
  }
}
