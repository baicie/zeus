import { createMemo, createSignal } from 'solid-js'
import type { RouteSectionProps } from '@solidjs/router'

const SUBTITLE =
  'createMemo() derives state from one or more signals. It is lazy — only re-evaluated when a tracked dependency changes — and memoised.'

function ComputedView(_props: RouteSectionProps) {
  // Demo 1 – name composition
  const [firstName, setFirstName] = createSignal('SolidJS')
  const [lastName, setLastName] = createSignal('Framework')

  const fullName = createMemo(() => {
    const f = firstName().trim()
    const l = lastName().trim()
    if (!f && !l) return '—'
    if (!f) return l
    if (!l) return f
    return f + ' ' + l
  })

  const initials = createMemo(() => {
    const fi = firstName().trim()
    const li = lastName().trim()
    return (
      (fi ? fi[0].toUpperCase() : '') + (li ? li[0].toUpperCase() : '') || '?'
    )
  })

  // Demo 2 – price calculator
  const [quantity, setQuantity] = createSignal(2)
  const [unitPrice, setUnitPrice] = createSignal(49)
  const [discount, setDiscount] = createSignal(10)

  const subtotal = createMemo(() => quantity() * unitPrice())
  const discountAmt = createMemo(() => subtotal() * (discount() / 100))
  const tax = createMemo(() => (subtotal() - discountAmt()) * 0.08)
  const grandTotal = createMemo(() => subtotal() - discountAmt() + tax())

  const subtotalStr = createMemo(() => '$' + subtotal().toFixed(2))
  const discountStr = createMemo(() => '-$' + discountAmt().toFixed(2))
  const taxStr = createMemo(() => '$' + tax().toFixed(2))
  const grandTotalStr = createMemo(() => '$' + grandTotal().toFixed(2))
  const discountLabel = createMemo(() => 'Discount (' + discount() + '%)')

  // Demo 3 – BMI
  const [weightKg, setWeightKg] = createSignal(70)
  const [heightCm, setHeightCm] = createSignal(175)

  const bmi = createMemo(() => {
    const h = heightCm() / 100
    return h === 0 ? 0 : weightKg() / (h * h)
  })

  const bmiStr = createMemo(() => bmi().toFixed(1))

  const bmiCategory = createMemo(() => {
    const b = bmi()
    if (b < 18.5) return 'Underweight'
    if (b < 25) return 'Normal weight'
    if (b < 30) return 'Overweight'
    return 'Obese'
  })

  const bmiColor = createMemo(() => {
    const b = bmi()
    if (b < 18.5) return '#89dceb'
    if (b < 25) return '#a6e3a1'
    if (b < 30) return '#fab387'
    return '#f38ba8'
  })

  const bmiBoxStyle = createMemo(() => ({
    borderColor: bmiColor(),
    background: bmiColor() + '22',
  }))

  const bmiValueStyle = createMemo(() => ({
    color: bmiColor(),
  }))

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
              value={firstName()}
              onInput={(e: InputEvent) =>
                setFirstName((e.target as HTMLInputElement).value)
              }
            />
          </div>
          <div class="field">
            <label>Last name</label>
            <input
              value={lastName()}
              onInput={(e: InputEvent) =>
                setLastName((e.target as HTMLInputElement).value)
              }
            />
          </div>
        </div>
        <div class="preview-box">
          <div style={{ display: 'flex', 'align-items': 'center', gap: '1rem' }}>
            <span
              style={{
                display: 'inline-flex',
                'align-items': 'center',
                'justify-content': 'center',
                width: '2.5rem',
                height: '2.5rem',
                'border-radius': '50%',
                background: '#7c6fe0',
                color: '#fff',
                'font-weight': '700',
                'font-size': '1rem',
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
              value={quantity()}
              onInput={(e: InputEvent) =>
                setQuantity(Number((e.target as HTMLInputElement).value))
              }
            />
          </div>
          <div class="field">
            <label>Unit price ($)</label>
            <input
              type="number"
              min="0"
              value={unitPrice()}
              onInput={(e: InputEvent) =>
                setUnitPrice(Number((e.target as HTMLInputElement).value))
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
            value={discount()}
            onInput={(e: InputEvent) =>
              setDiscount(Number((e.target as HTMLInputElement).value))
            }
            style={{ width: '100%', 'accent-color': '#7c6fe0' }}
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
            <label>Weight (kg): {weightKg()}</label>
            <input
              type="range"
              min="30"
              max="200"
              value={weightKg()}
              onInput={(e: InputEvent) =>
                setWeightKg(Number((e.target as HTMLInputElement).value))
              }
              style={{ width: '100%', 'accent-color': '#7c6fe0' }}
            />
          </div>
          <div class="field">
            <label>Height (cm): {heightCm()}</label>
            <input
              type="range"
              min="120"
              max="220"
              value={heightCm()}
              onInput={(e: InputEvent) =>
                setHeightCm(Number((e.target as HTMLInputElement).value))
              }
              style={{ width: '100%', 'accent-color': '#7c6fe0' }}
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
