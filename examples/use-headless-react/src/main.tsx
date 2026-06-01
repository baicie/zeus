import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ZButton,
  ZCheckbox,
  ZDialog,
  ZDialogContent,
  ZDialogDescription,
  ZDialogTitle,
  ZDialogTrigger,
  ZSwitch,
  ZTabPanel,
  ZTabList,
  ZTabTrigger,
  ZTabs,
} from '@zeus-ui/headless/react'

import '@zeus-ui/headless/styles.css'

function App() {
  const [switchOn, setSwitchOn] = useState(false)
  const [checkboxChecked, setCheckboxChecked] = useState(false)
  const [tabValue, setTabValue] = useState('account')
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div>
      <h1>React + Headless</h1>

      <h2>Button</h2>
      <div className="demo-section">
        <ZButton onPress={() => alert('Button pressed!')}>Default</ZButton>
        <ZButton variant="outline">Outline</ZButton>
        <ZButton variant="ghost">Ghost</ZButton>
        <ZButton disabled>Disabled</ZButton>
      </div>

      <h2>Switch</h2>
      <div className="demo-section">
        <ZSwitch
          checked={switchOn}
          onCheckedChange={(e: CustomEvent<{ checked: boolean }>) =>
            setSwitchOn(e.detail.checked)
          }
        >
          Enable notifications
        </ZSwitch>
        <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
          Switch is {switchOn ? 'ON' : 'OFF'}
        </p>
      </div>

      <h2>Checkbox</h2>
      <div className="demo-section">
        <ZCheckbox
          checked={checkboxChecked}
          onCheckedChange={(e: CustomEvent<{ checked: boolean }>) =>
            setCheckboxChecked(e.detail.checked)
          }
        >
          Accept terms and conditions
        </ZCheckbox>
        <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
          Checkbox is {checkboxChecked ? 'checked' : 'unchecked'}
        </p>
      </div>

      <h2>Tabs</h2>
      <div className="demo-section">
        <ZTabs
          value={tabValue}
          onValueChange={(e: CustomEvent<{ value: string }>) =>
            setTabValue(e.detail.value)
          }
        >
          <ZTabList>
            <ZTabTrigger value="account">Account</ZTabTrigger>
            <ZTabTrigger value="password">Password</ZTabTrigger>
            <ZTabTrigger value="settings" disabled>
              Settings
            </ZTabTrigger>
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
      <div className="demo-section">
        <ZDialog
          open={dialogOpen}
          onOpenChange={(e: CustomEvent<{ open: boolean }>) =>
            setDialogOpen(e.detail.open)
          }
        >
          <ZDialogTrigger>
            <button>Open Dialog</button>
          </ZDialogTrigger>
          <ZDialogContent>
            <ZDialogTitle>Confirm Action</ZDialogTitle>
            <ZDialogDescription>
              Are you sure you want to continue? This action cannot be undone.
            </ZDialogDescription>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <ZButton onPress={() => setDialogOpen(false)}>Cancel</ZButton>
              <ZButton variant="outline" onPress={() => setDialogOpen(false)}>
                Confirm
              </ZButton>
            </div>
          </ZDialogContent>
        </ZDialog>
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
