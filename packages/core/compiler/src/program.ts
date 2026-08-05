/**
 * Program visitor — entry and exit point for the entire transform pass.
 *
 * - Program.enter: initializes file metadata
 * - Program.exit: injects all collected codegen artifacts (templates, events, imports)
 */
import {
  appendTemplates,
  appendEvents,
  appendImportMethods,
} from './codegen/support'
import { collectDefineElementSetups } from './context'
import { setZeusMetadata } from './utils'

import type {
  BabelState,
  CompilerOptions,
  BabelProgramPath,
  BabelProgramVisitor,
} from './types'

//#region program enter

function enterProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  setZeusMetadata(state, config)
  collectDefineElementSetups(path, config.moduleName)
}

//#endregion

//#region program exit — orchestration

function exitProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  if (state.get('skip')) return

  if (config.generate === 'dom') {
    appendTemplates(path)
    if (config.delegateEvents) appendEvents(path)
  }

  appendImportMethods(path)
}

//#endregion

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
