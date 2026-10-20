import { onScopeDispose, untrack } from '@zeus-js/signal/internal'

import { createOwner, getCurrentOwner, runWithOwner } from './context'
import { emitDevtoolsEvent, getDevtoolsObjectId } from './devtools'

import type { JSXValue } from './types'

export function createComponent<
  P extends Record<string, unknown>,
  R extends JSXValue,
>(component: (props: P) => R, props: P): R {
  const owner = createOwner()
  const componentIdentity = {}
  const componentId = getDevtoolsObjectId(componentIdentity)
  emitDevtoolsEvent({
    type: 'component:create',
    componentId,
    componentName: component.name || 'Anonymous',
    ownerId: getCurrentOwner()
      ? getDevtoolsObjectId(getCurrentOwner()!)
      : undefined,
  })
  onScopeDispose(() => {
    emitDevtoolsEvent({ type: 'component:dispose', componentId })
  }, true)

  // Component setup is initialization, not a dependency of the parent
  // dynamic region. Reads made while creating queries/resources/signals must
  // stay local to the component's bindings instead of causing a parent
  // region to remount when those values change.
  return runWithOwner(owner, () => untrack(() => component(props)))
}
