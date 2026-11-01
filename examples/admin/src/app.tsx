import { QueryClientProvider, createQueryClient } from '@zeus-js/query'
import { RouterProvider } from '@zeus-js/router'
import { createEffect, createSignal, onCleanup } from '@zeus-js/zeus'

import { createAdminRouter } from './router'
import type { Role } from './routes'

/**
 * The application root owns the shared resources and provides them through
 * context. It initializes once: route changes only update bindings inside the
 * provider tree.
 */
export function App() {
  const [role, setRole] = createSignal<Role>('viewer')
  const queryClient = createQueryClient()
  const router = createAdminRouter({
    queryClient,
    role,
    onRoleChange: next => setRole(next),
  })
  onCleanup(() => {
    router.dispose()
    queryClient.dispose()
  })

  createEffect(() => {
    document.title = `${router.pathname()} · Zeus Admin`
  })

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
