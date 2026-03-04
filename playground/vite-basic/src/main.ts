import { createApp } from '@zeus-js/runtime-dom'
import { effect, signal } from '@zeus-js/signal'
import App from './App.js'

// 创建应用实例 / Create app instance
const app = createApp(App)

// 挂载应用到DOM / Mount app to DOM
app.mount('#app')

console.log('Zeus Demo App started!')

// Test signal (alien-signals uses function-based API)
const count = signal(0)
effect(() => {
  console.log('Count is:', count())
})
setInterval(() => {
  count(count() + 1)
}, 1000)
