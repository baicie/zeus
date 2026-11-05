import { render } from '@zeus-js/zeus'

import { App } from './app'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Application root element was not found.')
}

render(() => <App />, root)
