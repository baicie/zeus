import { createApp } from '@zeus-js/core'
import App from './App'

// 创建应用实例 / Create app instance
const app = createApp(App)

// 挂载应用到DOM / Mount app to DOM
app.mount('#app')
