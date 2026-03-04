import './style.css'
import { defineWebComponents } from './define-components'

defineWebComponents()

const app = document.getElementById('app')
if (!app) {
  throw new Error('Missing #app')
}

app.innerHTML = `
  <div class="container">
    <h1>Zeus Web Components + Vite</h1>
    <p>
      这个页面直接渲染你定义的自定义元素：
      <code>&lt;zeus-counter&gt;</code> 和 <code>&lt;zeus-counter-shadow&gt;</code>
    </p>

    <div class="grid">
      <div class="card" id="cardLight">
        <h2>Light DOM</h2>
        <div class="row">
          <zeus-counter id="counterLight" start="1" label="light"></zeus-counter>
        </div>
        <div class="row" style="margin-top: 10px">
          <button id="lightStart10">start=10</button>
          <button id="lightLabelFoo">label=foo</button>
          <button id="lightRemove">remove</button>
          <button id="lightAdd">add back</button>
        </div>
        <div class="note">修改 attribute 会触发 attributeChangedCallback 并重渲染。</div>
      </div>

      <div class="card">
        <h2>Shadow DOM</h2>
        <div class="row">
          <zeus-counter-shadow id="counterShadow" start="2" label="shadow"></zeus-counter-shadow>
        </div>
        <div class="row" style="margin-top: 10px">
          <button id="shadowStart20">start=20</button>
          <button id="shadowLabelBar">label=bar</button>
        </div>
        <div class="note">Shadow DOM 版本会渲染到 shadowRoot。</div>
      </div>
    </div>
  </div>
`

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el
}

const light = getEl('counterLight')
const shadow = getEl('counterShadow')

getEl('lightStart10').addEventListener('click', () => {
  light.setAttribute('start', '10')
})

getEl('lightLabelFoo').addEventListener('click', () => {
  light.setAttribute('label', 'foo')
})

getEl('shadowStart20').addEventListener('click', () => {
  shadow.setAttribute('start', '20')
})

getEl('shadowLabelBar').addEventListener('click', () => {
  shadow.setAttribute('label', 'bar')
})

getEl('lightRemove').addEventListener('click', () => {
  if (light.parentNode) {
    light.parentNode.removeChild(light)
  }
})

getEl('lightAdd').addEventListener('click', () => {
  const card = document.getElementById('cardLight')
  if (!card) return

  if (!document.getElementById('counterLight')) {
    const el = document.createElement('zeus-counter')
    el.id = 'counterLight'
    el.setAttribute('start', '1')
    el.setAttribute('label', 'light')

    const row = card.querySelector('.row')
    if (row) {
      row.appendChild(el)
    } else {
      card.appendChild(el)
    }
  }
})
