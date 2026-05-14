/**
 * Event registration and delegation.
 *
 * Tracks all event handlers encountered during JSX transform and generates
 * a single delegateEvents call at the end of the program (if any events
 * were found).
 */
import * as t from '@babel/types'

import { getRendererConfig, registerImportMethod } from './imports'

import type { BabelProgramPath } from '../types'
import type { ProgramScopeData } from './imports'
import type { NodePath } from '@babel/core'

//#region event registry

/**
 * Registers an event name in the program scope.
 * Events are deduplicated — registering the same event name multiple times
 * only keeps it once.
 */
export function registerEvent(path: NodePath, eventName: string): void {
  const scopeData = path.scope.data as ProgramScopeData
  const events = (scopeData.events ||= new Set())
  events.add(eventName)
}

//#endregion

//#region program injection

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

//#endregion
