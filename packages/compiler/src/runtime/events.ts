/**
 * Program injection codegen — event delegation.
 *
 * Generates a single delegateEvents(...) call at the end of the program body,
 * listing all events that were registered during the JSX transform pass.
 */
import * as t from '@babel/types'

import { getRendererConfig, registerImportMethod } from './imports'

import type { BabelProgramPath } from '../types'
import type { ProgramScopeData } from './imports'

/**
 * Generates a delegateEvents(...) call at the end of the program body.
 *
 * This implements the event delegation pattern: instead of attaching individual
 * addEventListener calls, we register event names with the runtime so it can
 * attach a single delegated listener at the root.
 */
export function appendEvents(path: BabelProgramPath): void {
  const scopeData = path.scope.data as ProgramScopeData
  const events = scopeData.events

  if (!events?.size) return

  path.node.body.push(
    t.expressionStatement(
      t.callExpression(
        registerImportMethod(
          path,
          'delegateEvents',
          getRendererConfig(path, 'dom').moduleName,
        ),
        [
          t.arrayExpression(
            Array.from(events).map(eventName => t.stringLiteral(eventName)),
          ),
        ],
      ),
    ),
  )
}
