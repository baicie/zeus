/* @refresh reload */
import { render } from 'solid-js/web'
import App from './App'

// 导入组件会自动注册 Web Component
import './components/SolidCounter'

const root = document.getElementById('root')

render(() => <App />, root!)
