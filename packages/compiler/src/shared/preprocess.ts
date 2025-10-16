import config from '../config'
import type * as t from '@babel/types'
import type { NodePathHub, TransformState } from '../type'

export default (path: NodePathHub<t.Node>, state: unknown): void => {
  const s = state as TransformState
  const merged = (path.hub.file!.metadata.config = Object.assign(
    {},
    config,
    s.opts,
  ))
  const lib = merged.requireImportSource
  if (lib) {
    const comments = path.hub.file?.ast.comments ?? []
    let process = false
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i]
      const pieces = comment.value.split('@jsxImportSource')
      if (pieces.length === 2 && pieces[1].trim() === lib) {
        process = true
        break
      }
    }
    if (!process) {
      s.skip = true
      return
    }
  }
}
