import { render } from '@zeus-js/zeus'

import '@zeus-web/data-grid/wc/auto'
import type {} from '@zeus-web/data-grid/wc'
import '@zeus-web/dialog/wc/auto'
import type {} from '@zeus-web/dialog/wc'
import '@zeus-web/input/wc/auto'
import type {} from '@zeus-web/input/wc'

import { App } from './app'
import './style.css'

const root = document.getElementById('root')
if (!root) throw new Error('Zeus Admin root element was not found.')

render(() => <App />, root)
