const App = () => {
  const getEl = id => {
    const el = document.getElementById(id)
    if (!el) {
      return null
    }
    return el
  }

  const onLightStart10 = () => {
    const el = getEl('counterLight')
    if (el) {
      el.setAttribute('start', '10')
    }
  }

  const onLightLabelFoo = () => {
    const el = getEl('counterLight')
    if (el) {
      el.setAttribute('label', 'foo')
    }
  }

  const onShadowStart20 = () => {
    const el = getEl('counterShadow')
    if (el) {
      el.setAttribute('start', '20')
    }
  }

  const onShadowLabelBar = () => {
    const el = getEl('counterShadow')
    if (el) {
      el.setAttribute('label', 'bar')
    }
  }

  const onLightRemove = () => {
    const el = getEl('counterLight')
    if (el && el.parentNode) {
      el.parentNode.removeChild(el)
    }
  }

  const onLightAdd = () => {
    const card = getEl('cardLight')
    if (!card) return

    if (!getEl('counterLight')) {
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
  }

  return (
    <div class="container">
      <h1>Zeus Web Components + Vite</h1>
      <p>
        这个页面直接渲染你定义的自定义元素：
        <code>&lt;zeus-counter&gt;</code> 和{' '}
        <code>&lt;zeus-counter-shadow&gt;</code>
      </p>

      <div class="grid">
        <div class="card" id="cardLight">
          <h2>Light DOM</h2>
          <div class="row">
            <zeus-counter id="counterLight" start="1" label="light" />
          </div>
          <div class="row" style={{ marginTop: '10px' }}>
            <button onClick={onLightStart10}>start=10</button>
            <button onClick={onLightLabelFoo}>label=foo</button>
            <button onClick={onLightRemove}>remove</button>
            <button onClick={onLightAdd}>add back</button>
          </div>
          <div class="note">
            修改 attribute 会触发 attributeChangedCallback 并重渲染。
          </div>
        </div>

        <div class="card">
          <h2>Shadow DOM</h2>
          <div class="row">
            <zeus-counter-shadow id="counterShadow" start="2" label="shadow" />
          </div>
          <div class="row" style={{ marginTop: '10px' }}>
            <button onClick={onShadowStart20}>start=20</button>
            <button onClick={onShadowLabelBar}>label=bar</button>
          </div>
          <div class="note">Shadow DOM 版本会渲染到 shadowRoot。</div>
        </div>
      </div>
    </div>
  )
}

export default App
