import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { CompilerOptions } from './shared/types'
import type { ScopeData } from './shared/types'

export type ZeusBabelFile = {
  ast: t.File
  metadata?: {
    config?: Required<CompilerOptions>
  }
}

export function getBabelFile(path: NodePath): ZeusBabelFile {
  return (path as unknown as { hub: { file: ZeusBabelFile } }).hub.file
}

export function setProgramScopeData(path: NodePath, data: ScopeData): void {
  const scope = path.scope.getProgramParent() as unknown as {
    data: ScopeData
  }
  scope.data = data
}

export function getProgramScopeData(path: NodePath): ScopeData | undefined {
  const scope = path.scope.getProgramParent() as unknown as { data?: ScopeData }
  return scope.data
}
