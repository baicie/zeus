import { appendTemplates } from './generate/appendTemplate'
import { appendEvents, appendImportMethods, setZeusMetadata } from './utils'

import type {
  BabelState,
  CompilerOptions,
  BabelProgramPath,
  BabelProgramVisitor,
} from './types'

/**
 * Called when the program is first visited.
 * initializes the metadata for the file.
 */
function enterProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  setZeusMetadata(state, config)
}

/**
 * Called when the program is finished being visited.
 * validates the templates and appends the templates to the program.
 */
function exitProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  if (state.get('skip')) return

  appendTemplates(path)

  appendEvents(path)

  appendImportMethods(path)
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
