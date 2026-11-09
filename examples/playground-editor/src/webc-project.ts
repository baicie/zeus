import type { PlaygroundProduct } from './products'
import type { MessageKey } from './playground/i18n'

export interface StudioFile {
  readonly path: string
  readonly content: string
}

export interface StudioTemplate {
  readonly product: PlaygroundProduct
  readonly titleKey: MessageKey
  readonly descriptionKey: MessageKey
  readonly files: readonly StudioFile[]
}

const counterElement = `import { createSignal, defineElement, Host, Slot } from '@zeus-js/zeus'

interface CounterProps {
  readonly count: number
  readonly label: string
  readonly disabled?: boolean
}

export const ZeCounter = defineElement(
  'z-counter',
  {
    shadow: false,
    props: {
      count: Number,
      label: String,
      disabled: Boolean,
    },
  },
  (props: CounterProps) => {
    const [count, setCount] = createSignal(props.count ?? 0)
    return (
      <Host>
        <style>{':host { display: block; }'}</style>
        <button
          disabled={props.disabled}
          onClick={() => setCount(count() + 1)}
        >
          {props.label}: {count()}
        </button>
        <Slot />
      </Host>
    )
  },
)
`

const elementEntry = `import { render } from '@zeus-js/zeus'
import { ZeCounter } from './counter'

if (!customElements.get('z-counter')) customElements.define('z-counter', ZeCounter)
render(
  () => (
    <z-counter label="Count" count={0}>
      <span slot="header">Projected slot</span>
    </z-counter>
  ),
  document.querySelector('#root')!,
)
`

export const templates: Readonly<Record<PlaygroundProduct, StudioTemplate>> = {
  'native-lab': {
    product: 'native-lab',
    titleKey: 'title.nativeLab',
    descriptionKey: 'product.nativeLab.description',
    files: [
      {
        path: 'src/main.tsx',
        content: `import { render } from '@zeus-js/zeus'
import { QueryClientProvider, createQueryClient } from '@zeus-js/query'
import { Link, RouterProvider, createMemoryHistory, createRouter } from '@zeus-js/router'
import { Counter } from './counter'
import './counter.css'

const queryClient = createQueryClient()
const router = createRouter({
  history: createMemoryHistory({ initialEntries: ['/lab'] }),
  routes: [
    {
      id: 'lab',
      path: '/lab',
      element: () => <Counter />,
    },
  ],
})

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  ),
  document.querySelector('#root')!,
)
`,
      },
      {
        path: 'src/counter.tsx',
        content: `import { Show, createSignal } from '@zeus-js/zeus'
import { useQuery } from '@zeus-js/query'
import { Link } from '@zeus-js/router'

export const Counter = () => {
  const [count, setCount] = createSignal(0)
  const status = useQuery({
    queryKey: ['counter-status'],
    queryFn: async () => ({ label: 'Router + Query ready' }),
    staleTime: Infinity,
  })
  return (
    <section>
      <nav><Link to="/lab">Native Lab</Link></nav>
      <Show when={status.data()} fallback={<p>Query loading…</p>}>
        <p data-testid="query-status">{status.data()?.label}</p>
      </Show>
      <button onClick={() => setCount(count() + 1)}>
        Count: {count()}
      </button>
    </section>
  )
}
`,
      },
      {
        path: 'src/counter.css',
        content: `button {
  box-shadow: 0 8px 24px rgb(22 102 83 / 18%);
}
`,
      },
    ],
  },
  'webc-studio': {
    product: 'webc-studio',
    titleKey: 'title.webcStudio',
    descriptionKey: 'product.webcStudio.description',
    files: [
      {
        path: 'src/counter.tsx',
        content: counterElement,
      },
      {
        path: 'src/main.tsx',
        content: elementEntry,
      },
    ],
  },
}
