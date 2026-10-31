import { getComponentEventName } from '@zeus-js/component-analyzer'

import { formatEventType, safePropertyName } from './formatType'
import { getEventMapTypeName } from './naming'

import type { ComponentRecord } from '@zeus-js/component-analyzer'

export function generateEventMap(component: ComponentRecord): string {
  const lines = [`export interface ${getEventMapTypeName(component)} {`]

  for (const [key, event] of Object.entries(component.events)) {
    const eventName = getComponentEventName(key, event)
    lines.push(`  ${safePropertyName(eventName)}: ${formatEventType(event)}`)
  }

  lines.push('}')
  return lines.join('\n')
}
