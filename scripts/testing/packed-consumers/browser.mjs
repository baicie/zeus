const mode = __CONSUMER_MODE__
const config = { value: 7 }
let formatterCalls = 0
const formatter = value => {
  formatterCalls++
  return String(value)
}
let presses = []
let update
let dispose
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export async function runConsumer() {
  const app = document.getElementById('app')
  const form = document.createElement('form')
  const container = document.createElement('div')
  const fieldset = document.createElement('fieldset')
  fieldset.append(container)
  form.append(fieldset)
  app.append(form)
  if (mode.startsWith('react')) {
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { flushSync } = await import('react-dom')
    const { ZPackedButton } = await import('@zeus-test/components/react')
    assert(
      !customElements.get('z-packed-button'),
      'React import registered a tag',
    )
    const root = createRoot(container)
    const ref = React.createRef()
    update = label =>
      flushSync(() =>
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(
              ZPackedButton,
              {
                ref,
                label,
                name: 'packed',
                config,
                formatter,
                onPress: e => presses.push(e.detail.value),
              },
              'slot',
            ),
          ),
        ),
      )
    dispose = () => flushSync(() => root.unmount())
    update('ready')
    assert(
      ref.current === document.querySelector('z-packed-button'),
      'React ref must expose host',
    )
  } else if (mode === 'vue3') {
    const { createApp, h, ref, nextTick } = await import('vue')
    const { ZPackedButton } = await import('@zeus-test/components/vue')
    assert(
      !customElements.get('z-packed-button'),
      'Vue import registered a tag',
    )
    const label = ref('ready')
    const app = createApp({
      render: () =>
        h(
          ZPackedButton,
          {
            label: label.value,
            name: 'packed',
            config,
            formatter,
            onPress: e => presses.push(e.detail.value),
          },
          () => 'slot',
        ),
    })
    app.mount(container)
    update = async value => {
      label.value = value
      await nextTick()
    }
    dispose = () => app.unmount()
  } else {
    const { defineCustomElement } = await import('@zeus-test/components/button')
    assert(!customElements.get('z-packed-button'), 'WC import registered a tag')
    defineCustomElement()
    defineCustomElement()
    const el = document.createElement('z-packed-button')
    Object.assign(el, {
      label: 'ready',
      defaultValue: 'ready',
      name: 'packed',
      config,
      formatter,
    })
    el.textContent = 'slot'
    el.addEventListener('press', event => presses.push(event.detail.value))
    container.append(el)
    update = value => {
      el.label = value
    }
    dispose = () => el.remove()
  }
  const host = document.querySelector('z-packed-button')
  assert(host, 'host missing')
  const pendingFocus = host.focusInput()
  await host.componentOnReady()
  await pendingFocus
  assert(
    !customElements.get('z-packed-unused'),
    'single wrapper registered unrelated tag',
  )
  assert(host.config === config, 'object property identity changed')
  assert(host.defaultValue === 'ready', 'default value missing')
  assert(
    host.formatter === formatter && formatterCalls === 0,
    'function property was invoked or changed',
  )
  const button = host.shadowRoot.querySelector('button')
  assert(button.textContent === 'ready', 'initial label missing')
  const injectedStyle = host.shadowRoot.querySelector('style')
  assert(injectedStyle, `style missing: ${host.shadowRoot.innerHTML}`)
  assert(
    injectedStyle.nonce === 'packed-style-nonce' ||
      injectedStyle.getAttribute('nonce') === 'packed-style-nonce',
    `style nonce missing: ${injectedStyle.outerHTML}`,
  )
  assert(
    getComputedStyle(button).color === 'rgb(1, 2, 3)',
    'design token did not reach shadow content',
  )
  host.style.setProperty('--packed-accent', 'rgb(4, 5, 6)')
  await new Promise(resolve => requestAnimationFrame(resolve))
  assert(
    getComputedStyle(button).color === 'rgb(4, 5, 6)',
    'design token update did not reach shadow content',
  )
  const partStyle = document.createElement('style')
  partStyle.textContent =
    'z-packed-button::part(control) { border-top-width: 3px; }'
  document.head.append(partStyle)
  await new Promise(resolve => requestAnimationFrame(resolve))
  assert(
    getComputedStyle(button).borderTopWidth === '3px',
    'external ::part style did not reach control',
  )
  assert(
    host.shadowRoot
      .querySelector('slot')
      .assignedNodes()
      .map(node => node.textContent)
      .join('') === 'slot',
    'slot lost',
  )
  const submitted = new FormData(form)
  assert(submitted.get('packed') === 'ready', 'form value missing')
  await host.focusInput()
  assert(document.activeElement === host, 'focus did not move to host')
  assert(
    host.shadowRoot.activeElement === button,
    'focus did not move to internal control',
  )
  button.click()
  assert(
    presses.length === 1 && presses[0] === 7,
    'event detail or duplicate listener',
  )
  await update('updated')
  assert(
    host.shadowRoot.querySelector('button') === button,
    'property update replaced DOM',
  )
  assert(button.textContent === 'updated', 'property update lost')
  assert(
    new FormData(form).get('packed') === 'updated',
    'form value did not update',
  )
  assert(
    host.defaultValue === 'ready',
    'default value changed with current value',
  )

  await update('')
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert(
    !(await host.checkFormValidity()),
    `empty current value unexpectedly valid: ${JSON.stringify({
      validity: await host.getFormValidity(),
      message: await host.getFormValidationMessage(),
    })}`,
  )
  assert(
    (await host.getFormValidity())?.valueMissing,
    'valueMissing validity flag missing',
  )
  assert(
    (await host.getFormValidationMessage()) === 'A label is required',
    'custom validity message missing',
  )

  fieldset.disabled = true
  await Promise.resolve()
  assert(
    host.dataset.fieldsetDisabled === 'true',
    'fieldset disabled did not reach host callback',
  )
  assert(button.disabled === true, 'fieldset disabled did not reach control')
  assert(
    await host.checkFormValidity(),
    'disabled form-associated host remained invalid',
  )

  fieldset.disabled = false
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert(
    host.dataset.fieldsetDisabled === 'false',
    'fieldset re-enable did not reach host callback',
  )
  assert(button.disabled === false, 'fieldset re-enable did not reach control')

  await update('updated')
  assert(
    (await host.getFormValidity())?.valid,
    'valid current value remained invalid',
  )
  form.reset()
  await Promise.resolve()
  assert(host.label === 'ready', 'form reset did not restore default')
  assert(
    new FormData(form).get('packed') === 'ready',
    'reset form value missing',
  )
  host.formStateRestoreCallback('restored', 'restore')
  await Promise.resolve()
  assert(host.label === 'restored', 'form state restore callback was lost')
  assert(
    new FormData(form).get('packed') === 'restored',
    'restored form value missing',
  )

  host.remove()
  container.append(host)
  await host.componentOnReady()
  const reconnectedButton = host.shadowRoot.querySelector('button')
  assert(
    reconnectedButton && reconnectedButton !== button,
    'rapid disconnect/reconnect did not remount the component',
  )
  reconnectedButton.click()
  assert(
    presses.length === 2 && presses[1] === 7,
    'rapid reconnect leaked or duplicated event listeners',
  )

  dispose()
  let detachedMethodError
  try {
    await host.focusInput()
  } catch (error) {
    detachedMethodError = String(error)
  }
  assert(
    detachedMethodError?.includes('ZEUS_WC_DISCONNECTED_BEFORE_READY'),
    'method call after disconnect was not rejected',
  )

  const { defineCustomElement: defineLightPanel } =
    await import('@zeus-test/components/light-panel')
  defineLightPanel()
  const panel = document.createElement('z-packed-light-panel')
  const initialBody = document.createElement('p')
  initialBody.textContent = 'initial body'
  const projectedInput = document.createElement('input')
  projectedInput.value = 'abcdef'
  initialBody.append(projectedInput)
  panel.append(initialBody)
  form.append(panel)
  await panel.componentOnReady()

  const headingFallback = panel.querySelector('[data-fallback="heading"]')
  const body = panel.querySelector('main p')
  assert(headingFallback, 'named slot fallback missing')
  assert(body === initialBody, 'default light DOM slot missing')

  const heading = document.createElement('h2')
  heading.slot = 'heading'
  heading.textContent = 'projected heading'
  panel.append(heading)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert(
    panel.querySelector('header h2') === heading,
    'named slot projection failed',
  )
  assert(
    !headingFallback.isConnected,
    'named fallback remained with assigned node',
  )

  heading.removeAttribute('slot')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert(
    panel.querySelector('main h2') === heading,
    'renamed slot was not reprojected',
  )
  assert(headingFallback.isConnected, 'named fallback did not return')

  const added = document.createElement('p')
  added.textContent = 'added body'
  panel.append(added)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert(
    panel.querySelector('main p') === initialBody,
    'existing default node moved',
  )
  assert(
    added.parentElement === panel.querySelector('[data-nested-slot="body"]'),
    'dynamic default node was not projected',
  )

  projectedInput.focus()
  projectedInput.setSelectionRange(2, 4)
  const bodyOutlet = panel.querySelector('[data-nested-slot="body"]')
  bodyOutlet.insertBefore(added, initialBody)
  await new Promise(resolve => setTimeout(resolve, 0))
  const projectedBodies = Array.from(panel.querySelectorAll('main p'))
  assert(
    projectedBodies[0] === added && projectedBodies[1] === initialBody,
    'default light DOM reorder changed projected identity or order',
  )
  assert(
    document.activeElement === projectedInput,
    `light DOM reorder lost focus: ${document.activeElement?.outerHTML ?? document.activeElement?.tagName}`,
  )
  assert(
    projectedInput.selectionStart === 2 && projectedInput.selectionEnd === 4,
    'light DOM reorder lost input selection',
  )

  added.remove()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert(!added.isConnected, 'removed projected node remained connected')
  initialBody.remove()
  heading.remove()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert(
    panel.querySelector('[data-fallback="body"]'),
    'default fallback did not return',
  )

  const panelParent = panel.parentNode
  panel.remove()
  document.body.append(panel)
  await panel.componentOnReady()
  const reconnectedBody = document.createElement('p')
  reconnectedBody.textContent = 'after reconnect'
  panel.append(reconnectedBody)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert(
    panel.querySelector('main p') === reconnectedBody,
    'projection observer did not resume after reconnect',
  )
  panel.remove()
  panelParent.append(panel)

  const { defineElement, onCleanup } = await import('@zeus-js/zeus')
  let eagerMounts = 0
  let eagerCleanups = 0
  const eagerTag = `z-packed-eager-lifecycle-${mode}`
  defineElement(eagerTag, { shadow: false }, () => {
    eagerMounts++
    const output = document.createElement('output')
    output.textContent = `mount-${eagerMounts}`
    onCleanup(() => eagerCleanups++)
    return output
  })
  const eagerHost = document.createElement(eagerTag)
  container.append(eagerHost)
  assert(eagerHost.textContent === 'mount-1', 'eager initial mount failed')

  for (let cycle = 2; cycle <= 4; cycle++) {
    eagerHost.remove()
    container.append(eagerHost)
    assert(
      eagerHost.textContent === `mount-${cycle}`,
      `eager reconnect ${cycle} did not remount`,
    )
    assert(
      eagerCleanups === cycle - 1,
      `eager reconnect ${cycle} did not dispose the previous owner`,
    )
  }
  eagerHost.remove()
  assert(eagerCleanups === eagerMounts, 'eager final detach leaked an owner')

  return { mode, passed: true }
}
