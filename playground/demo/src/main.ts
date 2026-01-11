import { createApp } from '@zeus-js/runtime-core'
import App from './App.tsx'

// 创建应用实例
const app = createApp(App)

// 挂载应用
app.mount('#app')

console.log('Zeus Demo App started!')
