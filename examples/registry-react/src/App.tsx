import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function App() {
  return (
    <main className="min-h-screen bg-[hsl(var(--z-background))] p-8 text-[hsl(var(--z-foreground))]">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <h1 className="text-2xl font-semibold">Zeus UI Registry — React</h1>

        <section className="flex gap-3">
          <Button>Default</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </section>

        <section>
          <Switch />
        </section>

        <section>
          <Checkbox />
        </section>

        <Dialog>
          <DialogTrigger>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog title</DialogTitle>
              <DialogDescription>
                This dialog is built on Zeus headless primitives.
              </DialogDescription>
            </DialogHeader>
            <p>Dialog content goes here.</p>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Tab 1 content</TabsContent>
          <TabsContent value="tab2">Tab 2 content</TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
