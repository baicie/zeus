import {
  formatMethodSignature,
  formatPropType,
  isRequiredProp,
  safePropertyName,
} from './formatType'
import { getElementTypeName } from './naming'

import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateElementTypeOptions {
  componentOnReady?: boolean
  eventMapTypeName?: string
  forcePromise?: boolean
}

export function generateElementType(
  component: ComponentRecord,
  options: GenerateElementTypeOptions = {},
): string {
  const elementTypeName = getElementTypeName(component)
  const propsTypeName = `${elementTypeName}Props`
  const methodsTypeName = `${elementTypeName}Methods`
  const eventTargetTypeName = `${elementTypeName}EventTarget`
  const lines: string[] = []

  lines.push(`interface ${propsTypeName} {`)

  for (const [name, prop] of Object.entries(component.props)) {
    const optional = isRequiredProp(prop) ? '' : '?'

    lines.push(
      `  ${safePropertyName(name)}${optional}: ${formatPropType(prop)}`,
    )
  }

  lines.push('}')
  lines.push('')
  lines.push(`interface ${methodsTypeName} {`)

  for (const method of Object.values(component.methods ?? {})) {
    lines.push(
      `  ${formatMethodSignature(method, { forcePromise: options.forcePromise })}`,
    )
  }

  if (options.componentOnReady) {
    lines.push(`  componentOnReady(): Promise<${elementTypeName}>`)
  }

  lines.push('}')

  if (options.eventMapTypeName) {
    lines.push('')
    lines.push(
      generateEventTargetType(
        elementTypeName,
        eventTargetTypeName,
        options.eventMapTypeName,
      ),
    )
  }

  const intersections = [methodsTypeName]

  if (options.eventMapTypeName) {
    intersections.push(eventTargetTypeName)
  }

  intersections.push('HTMLElement', `Omit<${propsTypeName}, keyof HTMLElement>`)

  lines.push('')
  lines.push(`export type ${elementTypeName} = ${intersections.join(' & ')}`)

  return lines.join('\n')
}

function generateEventTargetType(
  elementTypeName: string,
  eventTargetTypeName: string,
  eventMapTypeName: string,
): string {
  const lines: string[] = []

  lines.push(`interface ${eventTargetTypeName} {`)
  lines.push(`  addEventListener<K extends keyof ${eventMapTypeName}>(`)
  lines.push('    type: K,')
  lines.push(
    `    listener: (this: ${elementTypeName}, ev: ${eventMapTypeName}[K]) => unknown,`,
  )
  lines.push('    options?: boolean | AddEventListenerOptions,')
  lines.push('  ): void')
  lines.push('')
  lines.push(`  removeEventListener<K extends keyof ${eventMapTypeName}>(`)
  lines.push('    type: K,')
  lines.push(
    `    listener: (this: ${elementTypeName}, ev: ${eventMapTypeName}[K]) => unknown,`,
  )
  lines.push('    options?: boolean | EventListenerOptions,')
  lines.push('  ): void')
  lines.push('}')

  return lines.join('\n')
}
