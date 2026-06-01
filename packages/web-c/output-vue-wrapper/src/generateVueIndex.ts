import type { OutputVueWrapperOptions } from './types'
import type { ComponentRecord } from '@zeus-js/component-analyzer'

export function generateVueIndex(
  components: ComponentRecord[],
  options: OutputVueWrapperOptions,
): string {
  const lines: string[] = []

  for (const component of components) {
    const baseName = getFileBaseName(component.tag, options)
    lines.push(`export * from './${baseName}.js';`)
  }

  lines.push('')

  return lines.join('\n')
}

function getFileBaseName(
  tag: string,
  options: OutputVueWrapperOptions,
): string {
  if (options.fileName) {
    return sanitize(options.fileName(tag)).replace(/\.js$/, '')
  }

  let name = tag

  if (options.stripPrefix && name.startsWith(options.stripPrefix)) {
    name = name.slice(options.stripPrefix.length)
  }

  return sanitize(name)
}

function sanitize(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
