import fs from 'node:fs/promises'
import path from 'node:path'

interface Manifest {
  version: string
  generatedAt?: string
  components: Array<{
    tag: string
    name: string
    description?: string
    props: Record<string, PropDef>
    events: Record<string, EventDef>
    slots: Record<string, SlotDef>
    cssParts: string[]
    cssVars: string[]
  }>
}

interface PropDef {
  type: string
  default?: unknown
  values?: unknown[]
  reflect?: boolean
  attribute?: string
  description?: string
}

interface EventDef {
  detail?: Record<string, string>
  bubbles?: boolean
  composed?: boolean
  description?: string
}

interface SlotDef {
  description?: string
}

async function main() {
  const manifestPath = process.argv[2]
  const outDir = process.argv[3] ?? 'docs/generated/components'

  if (!manifestPath) {
    console.error(
      'Usage: tsx scripts/docs/generate-component-api.ts <manifest> [outDir]',
    )
    process.exit(1)
  }

  const manifest: Manifest = JSON.parse(
    await fs.readFile(manifestPath, 'utf-8'),
  )

  await fs.mkdir(outDir, { recursive: true })

  for (const component of manifest.components) {
    const md = renderComponent(component)
    await fs.writeFile(path.join(outDir, `${component.tag}.md`), md, 'utf-8')
    console.log(`Generated: ${outDir}/${component.tag}.md`)
  }

  console.log(`\nGenerated ${manifest.components.length} component docs.`)
}

function renderComponent(component: Manifest['components'][number]): string {
  const lines: string[] = []

  lines.push(`# \`${component.tag}\``)
  lines.push('')

  if (component.description) {
    lines.push(component.description)
    lines.push('')
  }

  lines.push('## Props')
  lines.push('')

  const propEntries = Object.entries(component.props)
  if (propEntries.length > 0) {
    lines.push('| Name | Type | Default | Description |')
    lines.push('|---|---|---|---|')

    for (const [name, prop] of propEntries) {
      lines.push(
        `| \`${name}\` | ${formatPropType(prop)} | ${formatDefault(prop.default)} | ${prop.description ?? ''} |`,
      )
    }
    lines.push('')
  } else {
    lines.push('*No props defined.*')
    lines.push('')
  }

  lines.push('## Events')
  lines.push('')

  const eventEntries = Object.entries(component.events)
  if (eventEntries.length > 0) {
    lines.push('| Name | Detail | Description |')
    lines.push('|---|---|---|')

    for (const [name, event] of eventEntries) {
      lines.push(
        `| \`${name}\` | \`${formatDetail(event.detail)}\` | ${event.description ?? ''} |`,
      )
    }
    lines.push('')
  } else {
    lines.push('*No events defined.*')
    lines.push('')
  }

  lines.push('## Slots')
  lines.push('')

  const slotEntries = Object.entries(component.slots)
  if (slotEntries.length > 0) {
    lines.push('| Name | Description |')
    lines.push('|---|---|')

    for (const [name, slot] of slotEntries) {
      const displayName = name === '' ? '(default)' : name
      lines.push(`| \`${displayName}\` | ${slot.description ?? ''} |`)
    }
    lines.push('')
  } else {
    lines.push('*No slots defined.*')
    lines.push('')
  }

  if (component.cssParts.length > 0) {
    lines.push('## CSS Parts')
    lines.push('')

    for (const part of component.cssParts) {
      lines.push(`- \`${part}\``)
    }
    lines.push('')
  }

  if (component.cssVars.length > 0) {
    lines.push('## CSS Variables')
    lines.push('')

    for (const cssVar of component.cssVars) {
      lines.push(`- \`${cssVar}\``)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function formatPropType(prop: PropDef): string {
  if (prop.values?.length) {
    return prop.values.map(item => `\`${JSON.stringify(item)}\``).join(' | ')
  }

  return `\`${prop.type ?? 'unknown'}\``
}

function formatDefault(value: unknown): string {
  if (value === undefined) return ''
  return `\`${JSON.stringify(value)}\``
}

function formatDetail(detail: Record<string, string> | undefined): string {
  if (!detail) return ''
  return Object.entries(detail)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
