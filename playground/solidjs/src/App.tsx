function App() {
  return (
    <>
      <h1 class="">SolidJS Web Components Demo</h1>
      <div class="card">
        <p>Below are custom elements created with solid-element:</p>
      </div>

      <div class="row" style={{ 'margin-top': '20px' }}>
        <h3>Light DOM Counter</h3>
        <solid-counter start="5" label="light" />
      </div>

      <div class="row" style={{ 'margin-top': '20px' }}>
        <h3>Shadow DOM Counter</h3>
        <solid-counter-shadow start="10" label="shadow" />
      </div>

      <div class="row" style={{ 'margin-top': '20px' }}>
        <h3>Multiple Counters (share state via custom events)</h3>
        <solid-counter id="counter1" start="0" label="counter A" />
        <solid-counter id="counter2" start="100" label="counter B" />
      </div>
    </>
  )
}

export default App
