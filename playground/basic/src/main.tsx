import { render } from '@zeusjs/zeus'
import { Counter } from './counter'

const container = document.getElementById('app')!
render(() => <Counter />, container)
