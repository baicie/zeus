import {
  RouterLink,
  RouterProvider,
  RouterView,
  createRouter,
  createWebHistory,
} from '@zeus-js/router'

import HomeView from './views/HomeView'
import CounterView from './views/CounterView'
import ConditionalView from './views/ConditionalView'
import ListView from './views/ListView'
import BindingView from './views/BindingView'
import ComputedView from './views/ComputedView'
import LifecycleView from './views/LifecycleView'
import RefView from './views/RefView'
import BuiltinView from './views/BuiltinView'

// ============================================================================
// 创建 Router
// ============================================================================

const router = createRouter({
  history: createWebHistory(),
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

// ============================================================================
// 导出
// ============================================================================

export { router, RouterProvider, RouterView, RouterLink }

// ============================================================================
// 导航配置
// ============================================================================

export const NAV_ITEMS = [
  { path: '/', icon: '🏠', label: 'Home', desc: 'Overview' },
  { path: '/counter', icon: '🔢', label: 'Counter', desc: 'signal()' },
  {
    path: '/conditional',
    icon: '🔀',
    label: 'Conditional',
    desc: 'branch rendering',
  },
  { path: '/list', icon: '📋', label: 'List Render', desc: 'array mapping' },
  {
    path: '/binding',
    icon: '✏️',
    label: 'Two-way Bind',
    desc: 'reactive input',
  },
  { path: '/computed', icon: '⚡', label: 'Computed', desc: 'derived state' },
  { path: '/lifecycle', icon: '🔄', label: 'Lifecycle', desc: 'hooks demo' },
  { path: '/ref', icon: '🔗', label: 'Ref', desc: 'DOM reference' },
  {
    path: '/builtin',
    icon: '🔧',
    label: 'Built-in',
    desc: 'Fragment, Portal...',
  },
]
