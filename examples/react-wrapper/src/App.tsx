// Virtual modules are registered by the bundler plugin.
// zeus:react:${tag} is the exact virtual module ID.
// The bundler plugin resolveId hook intercepts these.
import { ZButton } from 'zeus:react:z-button'

export function App() {
  return (
    <div>
      <h1>Zeus React Wrapper</h1>

      <div class="demo-section">
        <h3>Default Variant</h3>
        <ZButton
          onPress={event => {
            event.detail.nativeEvent.preventDefault()
            console.log('Button pressed!')
          }}
        >
          Default Button
        </ZButton>
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
  )
}
