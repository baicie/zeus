import { createRouter, createWebHashHistory } from '@zeus-js/router'
import HomeView from './views/HomeView'
import CounterView from './views/CounterView'
import ConditionalView from './views/ConditionalView'
import ListView from './views/ListView'
import BindingView from './views/BindingView'
import ComputedView from './views/ComputedView'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/counter', component: CounterView },
    { path: '/conditional', component: ConditionalView },
    { path: '/list', component: ListView },
    { path: '/binding', component: BindingView },
    { path: '/computed', component: ComputedView },
  ],
})

export default router
