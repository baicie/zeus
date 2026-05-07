import type { Visitor } from '@babel/core'

type PluginState = { opts: unknown }

function createProgramVisitor(): NonNullable<Visitor<PluginState>['Program']> {
  return {
    // enter: preprocess,
    // exit: postprocess,
  }
}

export default createProgramVisitor
