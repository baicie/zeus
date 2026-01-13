import { createApp } from '@zeus-js/runtime-core'
import App from './App.tsx'

// 创建应用实例 / Create app instance
const app = createApp(App)

// 挂载应用到DOM / Mount app to DOM
app.mount('#app')

console.log('Zeus Demo App started!')
