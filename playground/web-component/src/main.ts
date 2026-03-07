import './style.css'
import { createApp } from '@zeus-js/core'
import { defineWebComponents } from './define-components'
import App from './App'

defineWebComponents()

const app = createApp(App)
app.mount('#app')
