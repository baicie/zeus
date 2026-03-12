import { createRouter, createWebHashHistory } from '@zeus-js/router'

// Lazy-loaded components
const HomeView = function () {
  return import('./views/HomeView')
}
const CounterView = function () {
  return import('./views/CounterView')
}
const ConditionalView = function () {
  return import('./views/ConditionalView')
}
const ListView = function () {
  return import('./views/ListView')
}
const BindingView = function () {
  return import('./views/BindingView')
}
const ComputedView = function () {
  return import('./views/ComputedView')
}
const LifecycleView = function () {
  return import('./views/LifecycleView')
}
const RefView = function () {
  return import('./views/RefView')
}
const BuiltinView = function () {
  return import('./views/BuiltinView')
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/counter', component: CounterView },
    { path: '/conditional', component: ConditionalView },
    { path: '/list', component: ListView },
    { path: '/binding', component: BindingView },
    { path: '/computed', component: ComputedView },
    { path: '/lifecycle', component: LifecycleView },
    { path: '/ref', component: RefView },
    { path: '/builtin', component: BuiltinView },
  ],
})

export default router
