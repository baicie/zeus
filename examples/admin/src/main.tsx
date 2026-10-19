import { render } from '@zeus-js/zeus'

import { App } from './app'
import './style.css'

const root = document.getElementById('root')
if (!root) throw new Error('Zeus Admin root element was not found.')

render(() => <App />, root)
