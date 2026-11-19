import { defineCustomElement } from '@zeus-web/button/wc'

import type { ButtonElement } from '@zeus-web/button/wc'

defineCustomElement('zw-button')

const app = document.getElementById('app')
if (!app) throw new Error('Missing app root')

let pressed = 0
const status = document.createElement('output')
status.id = 'status'
status.textContent = 'pressed: 0'

const button = document.createElement('zw-button') as ButtonElement
button.textContent = 'Consume published WebC'
button.variant = 'primary'
button.addEventListener('press', () => {
  pressed += 1
  status.textContent = `pressed: ${pressed}`
})

app.append(button, status)
