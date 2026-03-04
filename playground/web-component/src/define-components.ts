import { adaptToWebComponent } from '@zeus-js/web-components'
import { effect, signal } from '@zeus-js/runtime-dom'

interface CounterProps {
  start?: string | number | null
  label?: string | null
}

function createCounterComponent() {
  return function Counter(props?: CounterProps): Node {
    const startRaw = props && props.start != null ? props.start : 0
    const start = typeof startRaw === 'number' ? startRaw : Number(startRaw)

    const count = signal(isNaN(start) ? 0 : start)

    const root = document.createElement('div')
    root.style.display = 'inline-flex'
    root.style.alignItems = 'center'
    root.style.gap = '10px'

    const labelEl = document.createElement('span')
    const btn = document.createElement('button')
    btn.textContent = 'inc'

    btn.addEventListener('click', () => {
      count(count() + 1)
    })

    const prefix = (props && props.label) || 'count'

    effect(() => {
      labelEl.textContent = `${prefix}: ${count()}`
    })

    root.appendChild(labelEl)
    root.appendChild(btn)
    return root
  }
}

export function defineWebComponents(): void {
  adaptToWebComponent(createCounterComponent(), {
    tagName: 'zeus-counter',
    shadow: false,
    observedAttributes: ['start', 'label'],
    attributeToProps(name, value, props) {
      if (name === 'start') {
        props.start = value
        return
      }
      if (name === 'label') {
        props.label = value
        return
      }
      ;(props as any)[name] = value
    },
  })

  adaptToWebComponent(createCounterComponent(), {
    tagName: 'zeus-counter-shadow',
    shadow: true,
    observedAttributes: ['start', 'label'],
    attributeToProps(name, value, props) {
      if (name === 'start') {
        props.start = value
        return
      }
      if (name === 'label') {
        props.label = value
        return
      }
      ;(props as any)[name] = value
    },
  })
}
