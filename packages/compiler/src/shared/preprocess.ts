import config from '../config'

export default function preprocess(path: any, state: any): void {
  const merged = (path.hub.file.metadata.config = Object.assign({}, config, state.opts))
  const lib = merged.requireImportSource
  if (!lib) return
  const comments = path.hub.file.ast.comments || []
  let process = false
  for (let i = 0; i < comments.length; i++) {
    const pieces = comments[i].value.split('@jsxImportSource')
    if (pieces.length === 2 && pieces[1].trim() === lib) {
      process = true
      break
    }
  }
  if (!process) state.skip = true
}
