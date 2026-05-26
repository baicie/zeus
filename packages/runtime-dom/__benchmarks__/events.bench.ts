import { bench, describe } from 'vitest'

import { bindEvent, delegateEvents } from '../dist/runtime-dom.esm-browser.prod'

describe('bindEvent', () => {
  bench('bind single event to element', () => {
    const button = document.createElement('button')
    const handler = () => {}
    bindEvent(button, 'click', handler)
  })

  bench('bind 10 events to 10 elements', () => {
    const events = [
      'click',
      'input',
      'focus',
      'blur',
      'keydown',
      'keyup',
      'mousedown',
      'mouseup',
      'touchstart',
      'touchend',
    ]
    for (let i = 0; i < 10; i++) {
      const el = document.createElement('div')
      bindEvent(el, events[i], () => {})
    }
  })

  bench('bind 100 events to 100 elements', () => {
    for (let i = 0; i < 100; i++) {
      const el = document.createElement('div')
      bindEvent(el, 'click', () => {})
    }
  })
})

describe('delegateEvents', () => {
  bench('delegate 1 event type', () => {
    delegateEvents(['click'])
  })

  bench('delegate 5 event types', () => {
    delegateEvents(['click', 'input', 'focus', 'blur', 'keydown'])
  })

  bench('delegate 10 event types', () => {
    delegateEvents([
      'click',
      'input',
      'focus',
      'blur',
      'keydown',
      'keyup',
      'mousedown',
      'mouseup',
      'touchstart',
      'touchend',
    ])
  })
})

describe('event dispatch (delegated)', () => {
  bench('dispatch click on delegated listener', () => {
    delegateEvents(['click'])
    const button = document.createElement('button')
    bindEvent(button, 'click', () => {})
    const event = new MouseEvent('click', { bubbles: true })
    button.dispatchEvent(event)
  })

  bench('dispatch 10 clicks on 10 delegated elements', () => {
    delegateEvents(['click'])
    for (let i = 0; i < 10; i++) {
      const button = document.createElement('button')
      bindEvent(button, 'click', () => {})
      const event = new MouseEvent('click', { bubbles: true })
      button.dispatchEvent(event)
    }
  })
})
