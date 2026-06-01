import type { NormalizedIconSource } from './types'

export function generateReactDts(icons: NormalizedIconSource[]): string {
  const lines: string[] = []

  lines.push(`import type * as React from 'react'`)
  lines.push('')

  lines.push(
    `export interface IconProps extends React.SVGAttributes<SVGSVGElement> {`,
  )
  lines.push(`  size?: string | number`)
  lines.push(`  title?: string`)
  lines.push(`}`)
  lines.push('')

  for (const icon of icons) {
    lines.push(
      `export declare const ${icon.componentName}: React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>`,
    )
  }

  lines.push('')

  return lines.join('\n')
}

export function generateVueDts(icons: NormalizedIconSource[]): string {
  const lines: string[] = []

  lines.push(`import type { DefineComponent } from 'vue'`)
  lines.push('')

  lines.push(`export interface IconProps {`)
  lines.push(`  size?: string | number`)
  lines.push(`  title?: string`)
  lines.push(`}`)
  lines.push('')

  for (const icon of icons) {
    lines.push(
      `export declare const ${icon.componentName}: DefineComponent<IconProps>`,
    )
  }

  lines.push('')

  return lines.join('\n')
}

export function generateStaticWcDts(icons: NormalizedIconSource[]): string {
  const lines: string[] = []

  for (const icon of icons) {
    const className = `${icon.componentName}Element`

    lines.push(`export interface ${className} extends HTMLElement {`)
    lines.push(`  size?: string`)
    lines.push(`  label?: string`)
    lines.push(`}`)
    lines.push('')
    lines.push(`export declare const ${icon.componentName}: {`)
    lines.push(`  new (): ${className}`)
    lines.push(`}`)
    lines.push('')
  }

  lines.push('declare global {')
  lines.push('  interface HTMLElementTagNameMap {')

  for (const icon of icons) {
    lines.push(
      `    ${JSON.stringify(icon.wcTag)}: ${icon.componentName}Element`,
    )
  }

  lines.push('  }')
  lines.push('}')
  lines.push('')
  lines.push('export {}')
  lines.push('')

  return lines.join('\n')
}
