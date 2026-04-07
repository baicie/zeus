import type { NodePath } from '@babel/core'
import type { Program } from '@babel/types'
import type { PluginPass } from '@babel/core'
import { getBabelFile, setProgramScopeData } from '../babel-cast'
import type { CompilerOptions } from '../shared/types'
import type { ScopeData } from '../shared/types'

export type ZeusPluginPass = PluginPass & {
  skip?: boolean
}

function checkImportSource(path: NodePath<Program>, source: string): boolean {
  const comments = getBabelFile(path).ast.comments
  if (!comments || !comments.length) {
    return false
  }
  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i]
    const pieces = comment.value.split('@jsxImportSource')
    if (pieces.length === 2 && pieces[1].trim() === source) {
      return true
    }
  }
  return false
}

export function preprocess(
  path: NodePath<Program>,
  merged: Required<CompilerOptions>,
  state: ZeusPluginPass,
): void {
  const file = getBabelFile(path)
  if (!file.metadata) {
    file.metadata = {}
  }
  file.metadata.config = merged

  const requireSource = merged.requireImportSource
  if (requireSource) {
    const ok = checkImportSource(path, requireSource)
    if (!ok) {
      state.skip = true
      return
    }
  }

  const data: ScopeData = {
    templates: [],
    imports: new Map(),
    events: new Set(),
    config: merged,
  }
  setProgramScopeData(path, data)
}
