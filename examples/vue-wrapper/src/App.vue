<script setup lang="ts">
// Virtual modules registered by the bundler plugin.
// zeus:vue:${tag} is the exact virtual module ID.
import { ZButton } from 'zeus:vue:z-button'

function handlePress(event: CustomEvent<{ nativeEvent: MouseEvent }>) {
  console.log('Button pressed!', event.detail.nativeEvent)
}
</script>

<template>
  <div>
    <h1>Zeus Vue Wrapper</h1>

    <div class="demo-section">
      <h3>Default Variant</h3>
      <ZButton @press="handlePress">Default Button</ZButton>
    </div>

    <div class="demo-section">
      <h3>Outline Variant</h3>
      <ZButton variant="outline">Outline Button</ZButton>
    </div>

    <div class="demo-section">
      <h3>Disabled</h3>
      <ZButton disabled>Disabled Button</ZButton>
    </div>
  </div>
</template>
