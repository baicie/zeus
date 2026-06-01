<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Switch from '@/components/ui/Switch.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
</script>

<template>
  <main class="min-h-screen bg-[hsl(var(--z-background))] p-8 text-[hsl(var(--z-foreground))]">
    <div class="mx-auto flex max-w-xl flex-col gap-6">
      <h1 class="text-2xl font-semibold">Zeus UI Registry — Vue</h1>

      <section class="flex gap-3">
        <Button>Default</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </section>

      <section>
        <Switch />
      </section>

      <section>
        <Checkbox />
      </section>
    </div>
  </main>
</template>
