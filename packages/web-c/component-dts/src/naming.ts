import { PORTABLE_GLOBAL_TYPE_REFERENCES } from '@zeus-js/component-analyzer'

import type { NormalizedComponentDtsOptions } from './types'
import type { ComponentRecord } from '@zeus-js/component-analyzer'

export function toPascalCase(value: string): string {
  const result = value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return result || 'Component'
}

export function getElementTypeName(component: ComponentRecord): string {
  if (component.name.endsWith('Element')) {
    return component.name
  }
  return `${component.name}Element`
}

export function toReactEventProp(eventName: string): string {
  return (
    'on' +
    eventName
      .split('-')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  )
}

export function getEventMapTypeName(component: ComponentRecord): string {
  return `${component.name}EventMap`
}

export function getPropsTypeName(component: ComponentRecord): string {
  return `${component.name}Props`
}

export function getGeneratedDeclarationNames(
  components: readonly ComponentRecord[],
): Set<string> {
  const names = new Set<string>(PORTABLE_GLOBAL_TYPE_REFERENCES)

  names.add('HTMLElementTagNameMap')
  names.add('JSX')
  names.add('React')
  names.add('DefineComponent')
  names.add('GlobalComponents')

  for (const component of components) {
    const elementTypeName = getElementTypeName(component)
    names.add(component.name)
    names.add(component.exportName)
    names.add(elementTypeName)
    names.add(`${elementTypeName}Props`)
    names.add(`${elementTypeName}Methods`)
    names.add(`${elementTypeName}EventTarget`)
    names.add(getEventMapTypeName(component))
    names.add(getPropsTypeName(component))
  }

  return names
}

export function getComponentFileBaseName(
  tag: string,
  options: NormalizedComponentDtsOptions,
): string {
  if (options.fileName) {
    return sanitizeFileName(options.fileName(tag)).replace(/\.d\.ts$/, '')
  }

  let name = tag

  if (options.stripPrefix && name.startsWith(options.stripPrefix)) {
    name = name.slice(options.stripPrefix.length)
  }

  return sanitizeFileName(name)
}

export function getComponentDtsFileName(
  tag: string,
  options: NormalizedComponentDtsOptions,
): string {
  return `${getComponentFileBaseName(tag, options)}.d.ts`
}

export function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
