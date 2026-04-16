import './counter'

const app = document.getElementById('app')!
app.innerHTML = `
  <h1>Zeus Web Components Demo</h1>
  <z-counter initial-count="5" step="2"></z-counter>
  <z-counter initial-count="10"></z-counter>
`
