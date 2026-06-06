<script setup lang="ts">
import { ref } from 'vue'
import {
  ZButton,
  ZCheckbox,
  ZDialog,
  ZDialogContent,
  ZDialogDescription,
  ZDialogTitle,
  ZDialogTrigger,
  ZInput,
  ZSwitch,
  ZTabPanel,
  ZTabList,
  ZTabTrigger,
  ZTabs,
} from '@zeus-ui/headless/vue'

import '@zeus-ui/headless/styles.css'

type Page = 'input' | 'components'

const page = ref<Page>('input')
const switchOn = ref(false)
const checkboxChecked = ref(false)
const tabValue = ref('account')
const dialogOpen = ref(false)
const email = ref('hello@zeus.dev')
const search = ref('')
const inputFocused = ref(false)

function handlePress() {
  alert('Button pressed!')
}

function handleSwitchChange(e: CustomEvent<{ checked: boolean }>) {
  switchOn.value = e.detail.checked
}

function handleCheckboxChange(e: CustomEvent<{ checked: boolean }>) {
  checkboxChecked.value = e.detail.checked
}

function handleTabChange(e: CustomEvent<{ value: string }>) {
  tabValue.value = e.detail.value
}

function handleDialogChange(e: CustomEvent<{ open: boolean }>) {
  dialogOpen.value = e.detail.open
}

function handleInputFocusChange(e: CustomEvent<{ focused: boolean }>) {
  inputFocused.value = e.detail.focused
}

function trimStart(value: string) {
  return value.trimStart()
}
</script>

<template>
  <div>
    <h1>Vue + Headless</h1>

    <nav style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem">
      <ZButton
        :variant="page === 'input' ? 'default' : 'outline'"
        @press="page = 'input'"
      >
        Input
      </ZButton>
      <ZButton
        :variant="page === 'components' ? 'default' : 'outline'"
        @press="page = 'components'"
      >
        Components
      </ZButton>
    </nav>

    <section v-if="page === 'input'">
      <h2>Input</h2>
      <div class="demo-section">
        <ZInput
          type="email"
          v-model:value="email"
          placeholder="name@example.com"
          required
          :invalid="!email.includes('@')"
          @focus-change="handleInputFocusChange"
        >
          <template #prefix>
            <span>@</span>
          </template>
          <template #suffix>
            <span>.dev</span>
          </template>
          <template #message>
            <span>{{
              email.includes('@')
                ? 'Email looks good.'
                : 'Email must contain @.'
            }}</span>
          </template>
        </ZInput>
        <p style="color: #94a3b8; margin-top: 0.5rem">
          Email: {{ email || '(empty)' }} ·
          {{ inputFocused ? 'focused' : 'blurred' }}
        </p>
      </div>

      <div class="demo-section">
        <ZInput
          type="search"
          size="lg"
          v-model:value="search"
          placeholder="Search components"
          :formatter="trimStart"
        >
          <template #prefix>
            <span>⌕</span>
          </template>
        </ZInput>
        <ZInput value="Disabled input" disabled>
          <template #message>
            <span>
              Disabled state uses reflected attributes and host data state.
            </span>
          </template>
        </ZInput>
      </div>
    </section>

    <template v-else>
      <h2>Button</h2>
      <div class="demo-section">
        <ZButton @press="handlePress">Default</ZButton>
        <ZButton variant="outline">Outline</ZButton>
        <ZButton variant="ghost">Ghost</ZButton>
        <ZButton disabled>Disabled</ZButton>
      </div>

      <h2>Switch</h2>
      <div class="demo-section">
        <ZSwitch :checked="switchOn" @checked-change="handleSwitchChange">
          Enable notifications
        </ZSwitch>
        <p style="color: #94a3b8; margin-top: 0.5rem">
          Switch is {{ switchOn ? 'ON' : 'OFF' }}
        </p>
      </div>

      <h2>Checkbox</h2>
      <div class="demo-section">
        <ZCheckbox
          :checked="checkboxChecked"
          @checked-change="handleCheckboxChange"
        >
          Accept terms and conditions
        </ZCheckbox>
        <p style="color: #94a3b8; margin-top: 0.5rem">
          Checkbox is {{ checkboxChecked ? 'checked' : 'unchecked' }}
        </p>
      </div>

      <h2>Tabs</h2>
      <div class="demo-section">
        <ZTabs :value="tabValue" @value-change="handleTabChange">
          <ZTabList>
            <ZTabTrigger value="account">Account</ZTabTrigger>
            <ZTabTrigger value="password">Password</ZTabTrigger>
            <ZTabTrigger value="settings" disabled>Settings</ZTabTrigger>
          </ZTabList>
          <ZTabPanel value="account">
            <p>Account settings panel</p>
          </ZTabPanel>
          <ZTabPanel value="password">
            <p>Change your password here.</p>
          </ZTabPanel>
        </ZTabs>
      </div>

      <h2>Dialog</h2>
      <div class="demo-section">
        <ZDialog :open="dialogOpen" @open-change="handleDialogChange">
          <ZDialogTrigger>
            <button>Open Dialog</button>
          </ZDialogTrigger>
          <ZDialogContent>
            <ZDialogTitle>Confirm Action</ZDialogTitle>
            <ZDialogDescription>
              Are you sure you want to continue? This action cannot be undone.
            </ZDialogDescription>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem">
              <ZButton @press="dialogOpen = false">Cancel</ZButton>
              <ZButton variant="outline" @press="dialogOpen = false">
                Confirm
              </ZButton>
            </div>
          </ZDialogContent>
        </ZDialog>
      </div>
    </template>
  </div>
</template>
