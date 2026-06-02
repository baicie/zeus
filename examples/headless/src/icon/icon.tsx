import { defineElement, effect, Host } from '@zeus-js/zeus'

import { icons, type IconName } from './icons'
import { bindOptionalAttr } from '../shared/dom'

export interface IconProps {
  name?: IconName
  size?: string
  label?: string
}

function setup(props: IconProps) {
  let svg!: SVGSVGElement

  const bindSvg = (el: SVGSVGElement | null) => {
    if (!el) return

    svg = el
    bindOptionalAttr(svg, 'width', () => props.size)
    bindOptionalAttr(svg, 'height', () => props.size)
    bindOptionalAttr(svg, 'aria-hidden', () =>
      props.label ? undefined : 'true',
    )
    bindOptionalAttr(svg, 'aria-label', () => props.label)

    effect(() => {
      const icon = icons[props.name as IconName] ?? icons.check

      svg.setAttribute('viewBox', icon.viewBox)
      svg.replaceChildren()
      appendIcon(svg, icon.render())
    })
  }

  return (
    <Host data-slot="icon" data-name={() => props.name}>
      <svg ref={bindSvg} part="root" focusable="false" />
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
