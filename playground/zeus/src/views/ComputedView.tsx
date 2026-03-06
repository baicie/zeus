import { computed, signal } from '@zeus-js/core'

const SUBTITLE =
  'computed() derives state from one or more signals. It is lazy — only re-evaluated when a tracked dependency changes — and memoised.'

function ComputedView() {
  // Demo 1 – name composition
  const firstName = signal('Zeus')
  const lastName = signal('Framework')
  const fullName = computed(function () {
    const f = firstName().trim()
    const l = lastName().trim()
    if (!f && !l) return '—'
    if (!f) return l
    if (!l) return f
    return f + ' ' + l
  })
  const initials = computed(function () {
    const fi = firstName().trim()
    const li = lastName().trim()
    return (
      (fi ? fi[0].toUpperCase() : '') + (li ? li[0].toUpperCase() : '') || '?'
    )
  })

  // Demo 2 – price calculator
  const quantity = signal(2)
  const unitPrice = signal(49)
  const discount = signal(10)
  const subtotal = computed(function () {
    return quantity() * unitPrice()
  })
  const discountAmt = computed(function () {
    return subtotal() * (discount() / 100)
  })
  const tax = computed(function () {
    return (subtotal() - discountAmt()) * 0.08
  })
  const grandTotal = computed(function () {
    return subtotal() - discountAmt() + tax()
  })

  // Formatted strings as computed so they're reactive
  const subtotalStr = computed(function () {
    return '$' + subtotal().toFixed(2)
  })
  const discountStr = computed(function () {
    return '-$' + discountAmt().toFixed(2)
  })
  const taxStr = computed(function () {
    return '$' + tax().toFixed(2)
  })
  const grandTotalStr = computed(function () {
    return '$' + grandTotal().toFixed(2)
  })
  const discountLabel = computed(function () {
    return 'Discount (' + discount() + '%)'
  })

  // Demo 3 – BMI
  const weightKg = signal(70)
  const heightCm = signal(175)
  const bmi = computed(function () {
    const h = heightCm() / 100
    return h === 0 ? 0 : weightKg() / (h * h)
  })
  const bmiStr = computed(function () {
    return bmi().toFixed(1)
  })
  const bmiCategory = computed(function () {
    const b = bmi()
    if (b < 18.5) return 'Underweight'
    if (b < 25) return 'Normal weight'
    if (b < 30) return 'Overweight'
    return 'Obese'
  })
  const bmiColor = computed(function () {
    const b = bmi()
    if (b < 18.5) return '#89dceb'
    if (b < 25) return '#a6e3a1'
    if (b < 30) return '#fab387'
    return '#f38ba8'
  })
  const bmiBoxStyle = computed(function () {
    return { borderColor: bmiColor(), background: bmiColor() + '22' }
  })
  const bmiValueStyle = computed(function () {
    return { color: bmiColor() }
  })
  const weightLabel = computed(function () {
    return 'Weight (kg): ' + weightKg()
  })
  const heightLabel = computed(function () {
    return 'Height (cm): ' + heightCm()
  })

  return (
    <div class="demo-card">
      <h2>⚡ Computed Values</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>Full Name Composer</h3>
        <div class="calc-grid">
          <div class="field">
            <label>First name</label>
            <input
              onInput={(e: InputEvent) =>
                firstName((e.target as HTMLInputElement).value)
              }
            />
          </div>
          <div class="field">
            <label>Last name</label>
            <input
              onInput={(e: InputEvent) =>
                lastName((e.target as HTMLInputElement).value)
              }
            />
          </div>
        </div>
        <div class="preview-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '50%',
                background: '#7c6fe0',
                color: '#fff',
                fontWeight: '700',
                fontSize: '1rem',
              }}
            >
              {initials()}
            </span>
            <span>
              Full name: <strong>{fullName()}</strong>
            </span>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Price Calculator</h3>
        <div class="calc-grid">
          <div class="field">
            <label>Quantity</label>
            <input
              type="number"
              min="1"
              onInput={(e: InputEvent) =>
                quantity(Number((e.target as HTMLInputElement).value))
              }
            />
          </div>
          <div class="field">
            <label>Unit price ($)</label>
            <input
              type="number"
              min="0"
              onInput={(e: InputEvent) =>
                unitPrice(Number((e.target as HTMLInputElement).value))
              }
            />
          </div>
        </div>
        <div class="field">
          <label>Discount: {discount()}%</label>
          <input
            type="range"
            min="0"
            max="50"
            onInput={(e: InputEvent) =>
              discount(Number((e.target as HTMLInputElement).value))
            }
            style={{ width: '100%', accentColor: '#7c6fe0' }}
          />
        </div>
        <table class="result-table">
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td>{subtotalStr()}</td>
            </tr>
            <tr>
              <td>{discountLabel()}</td>
              <td>{discountStr()}</td>
            </tr>
            <tr>
              <td>Tax (8%)</td>
              <td>{taxStr()}</td>
            </tr>
            <tr>
              <td>Grand Total</td>
              <td>{grandTotalStr()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <h3>BMI Calculator</h3>
        <div class="calc-grid">
          <div class="field">
            <label>{weightLabel()}</label>
            <input
              type="range"
              min="30"
              max="200"
              onInput={(e: InputEvent) =>
                weightKg(Number((e.target as HTMLInputElement).value))
              }
              style={{ width: '100%', accentColor: '#7c6fe0' }}
            />
          </div>
          <div class="field">
            <label>{heightLabel()}</label>
            <input
              type="range"
              min="120"
              max="220"
              onInput={(e: InputEvent) =>
                heightCm(Number((e.target as HTMLInputElement).value))
              }
              style={{ width: '100%', accentColor: '#7c6fe0' }}
            />
          </div>
        </div>
        <div class="preview-box" style={bmiBoxStyle()}>
          BMI: <strong style={bmiValueStyle()}>{bmiStr()}</strong>
          {' — '}
          <strong>{bmiCategory()}</strong>
        </div>
      </div>
    </div>
  )
}

export default ComputedView
