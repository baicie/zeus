import type * as BabelCore from '@babel/core'
import type { CompilerConfig } from './config'

export type NodePathHub<T = BabelCore.Node> = BabelCore.NodePath<T> & {
  hub: {
    file: {
      metadata: {
        config: CompilerConfig
      }
    }
  }
}
