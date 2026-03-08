import { createApp } from '@zeus-js/core'
import router from './router'
import App from './App'

const app = createApp(App)
app.use(router)
app.mount('#app')
