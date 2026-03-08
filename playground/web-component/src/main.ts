// Main entry - Web Components Library
// Note: Import CSS separately in consumer apps
import { defineWebComponents } from './define-components'
import App from './App'

defineWebComponents()

const app = createApp(App)
app.mount('#app')
