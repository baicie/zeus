import { onScopeDispose } from '@zeus-js/signal/internal'

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

  return runWithOwner(owner, () => component(props))
}
