<script setup lang="ts">
import { ZButton } from '@/components/ui/z-button'
import { ZSwitch } from '@/components/ui/z-switch'
import { ZCheckbox } from '@/components/ui/z-checkbox'
</script>

<template>
  <main class="min-h-screen bg-[hsl(var(--z-background))] p-8 text-[hsl(var(--z-foreground))]">
    <div class="mx-auto flex max-w-xl flex-col gap-6">
      <h1 class="text-2xl font-semibold">Zeus UI Registry — Vue</h1>

      <section class="flex gap-3">
        <ZButton variant="default">Default</ZButton>
        <ZButton variant="outline">Outline</ZButton>
        <ZButton variant="ghost">Ghost</ZButton>
        <ZButton variant="destructive">Destructive</ZButton>
      </section>

      <section>
        <ZSwitch />
      </section>

      <section>
        <ZCheckbox />
      </section>
    </div>
  </main>
</template>
