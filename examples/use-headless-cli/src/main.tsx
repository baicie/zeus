import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@/components/ui/button'
import './styles/zeus-theme.css'

function App() {
  return (
    <div className="min-h-screen bg-[hsl(var(--z-background))] text-[hsl(var(--z-foreground))] p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-8">
          Headless + CLI = Tailwind Styled Button
        </h1>
        <p className="text-[hsl(var(--z-muted-foreground))] mb-8 text-sm">
          This button was scaffolded using{' '}
          <code className="font-mono bg-[hsl(var(--z-muted))] px-1 rounded">
            zeus-ui add button
          </code>
          . It wraps the headless{' '}
          <code className="font-mono bg-[hsl(var(--z-muted))] px-1 rounded">
            ZButton
          </code>{' '}
          with Tailwind classes.
        </p>

        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--z-muted-foreground))] mb-4">
              Variants
            </h2>
            <div className="flex flex-wrap gap-3">
              <Button>Default</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--z-muted-foreground))] mb-4">
              Sizes
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Settings">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Button>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--z-muted-foreground))] mb-4">
              Interactive
            </h2>
            <div className="flex flex-wrap gap-3">
              <Button onPress={() => alert('Button pressed!')}>Press Me</Button>
              <Button
                variant="outline"
                onPress={() => alert('Outline pressed!')}
              >
                Outline Press
              </Button>
              <Button disabled>Disabled</Button>
            </div>
          </section>
        </div>

        <div className="mt-12 p-4 border border-[hsl(var(--z-border))] rounded-lg text-sm text-[hsl(var(--z-muted-foreground))]">
          <strong className="text-[hsl(var(--z-foreground))]">
            How this works:
          </strong>
          <ol className="mt-2 space-y-1 list-decimal list-inside">
            <li>
              Run{' '}
              <code className="font-mono bg-[hsl(var(--z-muted))] px-1 rounded">
                zeus-ui add button
              </code>{' '}
              to scaffold a component
            </li>
            <li>
              The command generates{' '}
              <code className="font-mono bg-[hsl(var(--z-muted))] px-1 rounded">
                src/components/ui/button.tsx
              </code>{' '}
              with Tailwind styling
            </li>
            <li>
              Behind the scenes, it wraps{' '}
              <code className="font-mono bg-[hsl(var(--z-muted))] px-1 rounded">
                ZButton
              </code>{' '}
              from{' '}
              <code className="font-mono bg-[hsl(var(--z-muted))] px-1 rounded">
                @zeus-ui/headless/react
              </code>
            </li>
            <li>
              The headless primitive provides behavior; Tailwind provides the
              look
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
