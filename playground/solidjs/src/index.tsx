/* @refresh reload */
import { render } from 'solid-js/web'
import { Router, Route } from '@solidjs/router'
import App from './App'
import HomeView from './views/HomeView'
import CounterView from './views/CounterView'
import ConditionalView from './views/ConditionalView'
import ListView from './views/ListView'
import BindingView from './views/BindingView'
import ComputedView from './views/ComputedView'
import LifecycleView from './views/LifecycleView'
import RefView from './views/RefView'
import BuiltinView from './views/BuiltinView'

const root = document.getElementById('root')

render(
  () => (
    <Router root={App}>
      <Route path="/" component={HomeView} />
      <Route path="/counter" component={CounterView} />
      <Route path="/conditional" component={ConditionalView} />
      <Route path="/list" component={ListView} />
      <Route path="/binding" component={BindingView} />
      <Route path="/computed" component={ComputedView} />
      <Route path="/lifecycle" component={LifecycleView} />
      <Route path="/ref" component={RefView} />
      <Route path="/builtin" component={BuiltinView} />
    </Router>
  ),
  root!
)
