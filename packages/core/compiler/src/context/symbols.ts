import type { CompilerContext } from './CompilerContext'
import type * as t from '@babel/types'

export function uid(context: CompilerContext, name: string): t.Identifier {
  return context.uid(name)
}

export function uidName(context: CompilerContext, name: string): string {
  return context.uid(name).name
}
