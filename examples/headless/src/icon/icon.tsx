import { defineElement, Host, watch } from '@zeus-js/zeus'

import { icons, type IconName } from './icons'

export interface IconProps {
  name?: IconName
  size?: string
  label?: string
}

function setup(props: IconProps) {
  let svg!: SVGSVGElement

  const renderIcon = () => {
    const icon = icons[props.name as IconName] ?? icons.check
    svg.setAttribute('viewBox', icon.viewBox)
    svg.replaceChildren()
    appendIcon(svg, icon.render())
  }

  // Render icon reactively when props.name changes
  watch(
    () => props.name,
    () => {
      if (svg) renderIcon()
    },
  )

  return (
    <Host data-slot="icon" data-name={() => props.name}>
      <svg
        ref={(svgEl: SVGSVGElement | null) => {
          if (svgEl) {
            svg = svgEl
            renderIcon()
          }
        }}
        part="root"
        focusable="false"
        width={() => props.size}
        height={() => props.size}
        aria-hidden={() => (props.label ? undefined : 'true')}
        aria-label={() => props.label}
      />
    </Host>
  )
}

function appendIcon(parent: SVGSVGElement, value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) appendIcon(parent, child)
    return
  }

  if (value instanceof Node) {
    parent.appendChild(value)
  }
}

export const ZIcon = defineElement<IconProps>(
  'z-icon',
  {
    shadow: false,

    props: {
      name: {
        type: String,
        default: 'check',
        reflect: true,
      },
      size: {
        type: String,
        default: '1em',
        reflect: true,
      },
      label: {
        type: String,
        attr: 'aria-label',
      },
    },

    meta: {
      description: 'Headless icon primitive.',
      cssParts: ['root'],
    },
  },
  setup,
)
