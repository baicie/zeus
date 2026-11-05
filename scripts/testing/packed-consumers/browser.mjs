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
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

/**
 * Browser acceptance for the framework-neutral renderer host (RFC-011).
 * The grid element owns its business action and cell containers; React or
 * Vue only owns the framework nodes mounted inside one container.
 */
async function runRendererHostChecks() {
  if (mode === 'native') return
  const react = mode.startsWith('react')
  const { createRendererHost } = await import('@zeus-js/web-c-runtime')
  const metrics = { active: 0, mounts: 0, cleanups: 0, sessions: [] }
  const React = react ? await import('react') : undefined
  const Vue = react ? undefined : await import('vue')

  function ReactCell(props) {
    const [count, setCount] = React.useState(0)
    React.useEffect(() => {
      metrics.mounts++
      metrics.active++
      return () => {
        metrics.cleanups++
        metrics.active--
      }
    }, [])
    return React.createElement(
      'div',
      { 'data-fw': 'react' },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-fw-button': '',
          onClick: () => setCount(value => value + 1),
        },
        props.data.label,
      ),
      React.createElement('output', { 'data-fw-count': '' }, String(count)),
    )
  }

  const VueCell = react
    ? undefined
    : Vue.defineComponent({
        props: { data: { type: Object, required: true } },
        setup(props) {
          const count = Vue.ref(0)
          Vue.onMounted(() => {
            metrics.mounts++
            metrics.active++
          })
          Vue.onUnmounted(() => {
            metrics.cleanups++
            metrics.active--
          })
          return () =>
            Vue.h('div', { 'data-fw': 'vue' }, [
              Vue.h(
                'button',
                {
                  type: 'button',
                  'data-fw-button': '',
                  onClick: () => count.value++,
                },
                props.data.label,
              ),
              Vue.h('output', { 'data-fw-count': '' }, String(count.value)),
            ])
        },
      })

  const adapter = react
    ? (
        await import('@zeus-js/output-react-wrapper/renderer')
      ).createReactRenderer(
        (data, _context, session) => {
          metrics.sessions.push(session)
          return React.createElement(ReactCell, { data })
        },
        { strict: true },
      )
    : (await import('@zeus-js/output-vue-wrapper/renderer')).createVueRenderer(
        (data, _context, session) => {
          metrics.sessions.push(session)
          return Vue.h(VueCell, { data })
        },
      )

  const portalTarget = document.createElement('div')
  portalTarget.setAttribute('data-portal-target', '')
  document.body.append(portalTarget)
  const portalContainer = document.createElement('div')
  document.body.append(portalContainer)
  let portalAdapter
  let portalLabel = 'portal'
  if (react) {
    const { createPortal } = await import('react-dom')
    portalAdapter = (
      await import('@zeus-js/output-react-wrapper/renderer')
    ).createReactRenderer(label => {
      portalLabel = label
      return React.createElement(
        React.Fragment,
        null,
        React.createElement('code', { 'data-inline': '' }, label),
        createPortal(
          React.createElement('i', { 'data-portal': '' }, label),
          portalTarget,
        ),
      )
    })
  } else {
    portalAdapter = (
      await import('@zeus-js/output-vue-wrapper/renderer')
    ).createVueRenderer(label =>
      Vue.h(Vue.Fragment, null, [
        Vue.h('code', { 'data-inline': '' }, label),
        Vue.h(Vue.Teleport, { to: portalTarget }, [
          Vue.h('i', { 'data-portal': '' }, label),
        ]),
      ]),
    )
  }
  const portalHost = createRendererHost(portalAdapter)
  portalHost.render([
    {
      key: 'portal',
      container: portalContainer,
      data: portalLabel,
      context: undefined,
    },
  ])
  assert(
    portalContainer.querySelector('[data-inline]')?.textContent === 'portal',
    'framework inline content missing',
  )
  assert(
    portalTarget.querySelector('[data-portal]')?.textContent === 'portal',
    'framework portal content missing',
  )
  portalHost.dispose()
  assert(
    portalTarget.childNodes.length === 0 && portalTarget.isConnected,
    'portal content or target was not cleaned up',
  )
  portalContainer.remove()
  portalTarget.remove()

  const tag = `z-packed-renderer-grid-${mode}`
  class RendererGrid extends HTMLElement {
    connectedCallback() {
      if (!this.cellContainer) {
        this.innerHTML =
          '<button type="button" data-ce-action>CE action: <output data-ce-count>0</output></button>' +
          '<div data-cell-container></div>'
        this.ceCount = 0
        this.ceOutput = this.querySelector('[data-ce-count]')
        this.querySelector('[data-ce-action]').addEventListener('click', () => {
          this.ceCount++
          this.ceOutput.textContent = String(this.ceCount)
        })
        this.cellContainer = this.querySelector('[data-cell-container]')
      }
      this.host = createRendererHost(adapter)
      this.renderCell()
    }

    renderCell() {
      this.host.render([
        {
          key: 'row-1',
          container: this.cellContainer,
          data: { label: this.getAttribute('label') ?? 'cell' },
          context: undefined,
        },
      ])
    }

    updateCell(label) {
      this.setAttribute('label', label)
      this.renderCell()
    }

    disconnectedCallback() {
      this.host?.dispose()
      this.host = undefined
    }
  }
  if (!customElements.get(tag)) customElements.define(tag, RendererGrid)

  const grid = document.createElement(tag)
  grid.setAttribute('label', 'first')
  document.body.append(grid)
  await tick()
  const cellContainer = grid.querySelector('[data-cell-container]')
  const firstButton = cellContainer.querySelector('[data-fw-button]')
  assert(firstButton?.textContent === 'first', 'initial framework cell missing')
  assert(
    !cellContainer.querySelector('[data-ce-action]'),
    'CE business logic was copied into the framework cell',
  )
  firstButton.click()
  await tick()
  assert(
    cellContainer.querySelector('[data-fw-count]')?.textContent === '1',
    'framework cell state did not update',
  )
  const firstSession = metrics.sessions.at(-1)
  assert(!firstSession.signal.aborted, 'mounted session was already aborted')
  grid.updateCell('second')
  assert(
    cellContainer.querySelector('[data-fw-button]') === firstButton,
    'same-key update replaced the framework DOM',
  )
  assert(
    firstButton.textContent === 'second',
    'same-key update did not reach the framework cell',
  )
  assert(
    cellContainer.querySelector('[data-fw-count]')?.textContent === '1',
    'same-key update lost framework state',
  )

  const ceAction = grid.querySelector('[data-ce-action]')
  ceAction.click()
  assert(
    grid.querySelector('[data-ce-count]').textContent === '1',
    'CE-owned action did not use CE state',
  )
  grid.remove()
  assert(firstSession.signal.aborted, 'disconnect did not abort the session')
  assert(metrics.active === 0, 'disconnect leaked a framework effect')
  document.body.append(grid)
  await tick()
  const reconnectedButton = grid.querySelector('[data-fw-button]')
  assert(
    reconnectedButton && reconnectedButton !== firstButton,
    'reconnect reused the disposed framework root',
  )
  assert(
    grid.querySelector('[data-fw-count]')?.textContent === '0',
    'reconnect did not create a fresh framework root',
  )
  assert(
    grid.querySelector('[data-fw-button]')?.textContent === 'second',
    'reconnect lost the grid data',
  )
  const reconnectedSession = metrics.sessions.at(-1)
  assert(
    !reconnectedSession.signal.aborted,
    'reconnected session was already aborted',
  )
  grid.querySelector('[data-fw-button]').click()
  await tick()
  assert(
    grid.querySelector('[data-fw-count]')?.textContent === '1',
    'reconnected framework cell did not accept interaction',
  )
  ceAction.click()
  assert(
    grid.querySelector('[data-ce-count]').textContent === '2',
    'CE disconnect/reconnect duplicated its listener',
  )
  grid.remove()
  assert(metrics.active === 0, 'final disconnect leaked a framework effect')

  const cycleContainer = document.createElement('div')
  document.body.append(cycleContainer)
  const cycleHost = createRendererHost(adapter)
  const cells = Array.from({ length: 2 }, () => {
    const element = document.createElement('div')
    cycleContainer.append(element)
    return element
  })
  for (let cycle = 0; cycle < 60; cycle++) {
    cycleHost.render(
      cells.map((container, index) => ({
        key: `row-${index}`,
        container,
        data: { label: `cycle-${cycle}` },
        context: undefined,
      })),
    )
    assert(metrics.active === 2, `cycle ${cycle} did not mount both cells`)
    cycleHost.render([])
    assert(metrics.active === 0, `cycle ${cycle} leaked a framework effect`)
  }
  cycleHost.dispose()
  assert(
    cells.every(element => element.childNodes.length === 0),
    'cycle cleanup left framework nodes behind',
  )
  assert(
    metrics.cleanups === metrics.mounts,
    `framework cleanup count ${metrics.cleanups} did not reach mount count ${metrics.mounts}`,
  )
  assert(
    (() => {
      try {
        cycleHost.render([])
        return false
      } catch (error) {
        return String(error).includes('ZEUS_RENDERER_DISPOSED')
      }
    })(),
    'render after host disposal was not rejected',
  )
  cycleContainer.remove()

  const brokenContainer = document.createElement('div')
  document.body.append(brokenContainer)
  const brokenAdapter = react
    ? (
        await import('@zeus-js/output-react-wrapper/renderer')
      ).createReactRenderer(() => {
        throw new Error('renderer boom')
      })
    : (await import('@zeus-js/output-vue-wrapper/renderer')).createVueRenderer(
        () => {
          throw new Error('renderer boom')
        },
      )
  const brokenHost = createRendererHost(brokenAdapter)
  let brokenError
  try {
    brokenHost.render([
      {
        key: 'broken',
        container: brokenContainer,
        data: undefined,
        context: undefined,
      },
    ])
  } catch (error) {
    brokenError = error
  }
  assert(
    String(brokenError).includes('ZEUS_RENDERER_ADAPTER_FAILURE') &&
      String(brokenError.cause?.message).includes('renderer boom'),
    'framework mount failure was not diagnosed',
  )
  assert(
    brokenContainer.childNodes.length === 0,
    'failed framework mount left orphan nodes',
  )
  brokenHost.dispose()
  brokenContainer.remove()
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
  partStyle.nonce = 'packed-style-nonce'
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
  panel.theme = 'light'
  const initialBody = document.createElement('p')
  initialBody.textContent = 'initial body'
  const projectedInput = document.createElement('input')
  projectedInput.value = 'abcdef'
  initialBody.append(projectedInput)
  panel.append(initialBody)
  form.append(panel)
  await panel.componentOnReady()

  const panelStyle = panel.querySelector('style')
  assert(panelStyle, `light DOM style missing: ${panel.innerHTML}`)
  assert(
    panelStyle.nonce === 'packed-light-style-nonce' ||
      panelStyle.getAttribute('nonce') === 'packed-light-style-nonce',
    `light DOM style nonce missing: ${panelStyle.outerHTML}`,
  )
  assert(
    getComputedStyle(panel).color === 'rgb(7, 8, 9)',
    'light DOM design token did not reach host',
  )
  panel.style.setProperty('--packed-light-accent', 'rgb(10, 11, 12)')
  await new Promise(resolve => requestAnimationFrame(resolve))
  assert(
    getComputedStyle(panel).color === 'rgb(10, 11, 12)',
    'light DOM design token update did not reach host',
  )

  const hostThemeStyle = document.createElement('style')
  hostThemeStyle.nonce = 'packed-light-style-nonce'
  hostThemeStyle.textContent =
    'z-packed-light-panel[data-theme="dark"] { color: rgb(13, 14, 15); }'
  document.head.append(hostThemeStyle)
  panel.theme = 'dark'
  await new Promise(resolve => requestAnimationFrame(resolve))
  assert(
    panel.dataset.theme === 'dark',
    'Host data-theme attribute did not update',
  )
  assert(
    getComputedStyle(panel).color === 'rgb(13, 14, 15)',
    'Host data-theme CSS did not update theme',
  )
  const blockedStyle = document.createElement('style')
  blockedStyle.textContent =
    'z-packed-light-panel[data-theme="dark"] { outline-width: 9px; }'
  document.head.append(blockedStyle)
  await new Promise(resolve => requestAnimationFrame(resolve))
  assert(
    getComputedStyle(panel).outlineWidth !== '9px',
    'Content Security Policy allowed a style without a nonce',
  )
  blockedStyle.remove()

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
  assert(
    panel.querySelectorAll('style').length === 1,
    'light DOM reconnect accumulated duplicate styles',
  )
  assert(
    panel.querySelector('style')?.nonce === 'packed-light-style-nonce',
    'light DOM reconnect lost style nonce',
  )
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

  await runRendererHostChecks()

  return { mode, passed: true }
}
