/**
 * Component gallery (`/admin/components`).
 *
 * This page exists to answer one question: *does the Zeus UI component library
 * actually work inside this app?* So every card below renders a real `zw-*`
 * element — the same element, with the same attributes and events, that a
 * consumer of `@zeus-web/*` gets. Nothing here is a styled stand-in.
 *
 * That was not true before R6-C. The page claimed to talk "to the real
 * component packages" while containing zero `zw-*` elements: the dialog was a
 * `<Show>` plus a scrim div, the switch a `<button role="switch">`, the tabs
 * three buttons, the toast a `<p role="status">`. A reader could not tell
 * whether Zeus UI worked, because Zeus UI was not on the page.
 *
 * Two rules follow from that, and they are not negotiable:
 *
 * 1. **If the component exists, render it.** No local reimplementation, even
 *    when the local one looks nicer.
 * 2. **If it does not exist, say so.** A handful of things Admin needs have no
 *    Zeus UI counterpart (an empty state, a spinner, pagination). Those keep
 *    Admin's own markup and carry a marker that names what is missing, rather
 *    than being dressed up as a library component.
 *
 * The props below are the generated JSX types each package ships
 * (`dist/wc/types/jsx.d.ts`), not guesses: the event handlers are camelCase
 * (`onValueChange`, `onPress`, `onOpenChange`), and values are plain `value`
 * props. Written any other way the page still compiles but the interaction is
 * inert, which is the failure mode this page exists to expose.
 *
 * The mapping matrix is `docs/release/r6-c-gallery-mapping.md`.
 */
import { For, Show, createSignal } from '@zeus-js/zeus'

import type { AdminMessageKey } from './locales/en'
import { Icon } from './shell/icon'
import { t } from './i18n'
import type { DialogElement } from '@zeus-web/dialog/wc'
import type { ToastElement } from '@zeus-web/toast/wc'

import { withProp, withRef } from './zw-jsx'

interface GallerySection {
  readonly id: string
  readonly title: AdminMessageKey
  readonly hint: AdminMessageKey
}

const TABS = [
  { id: 'one', label: 'gallery.tab.one', panel: 'gallery.tabPanel.one' },
  { id: 'two', label: 'gallery.tab.two', panel: 'gallery.tabPanel.two' },
  { id: 'three', label: 'gallery.tab.three', panel: 'gallery.tabPanel.three' },
] as const satisfies readonly {
  id: 'one' | 'two' | 'three'
  label: AdminMessageKey
  panel: AdminMessageKey
}[]

const ACCORDION = [
  {
    id: 'a',
    trigger: 'gallery.accordion.a',
    panel: 'gallery.accordionPanel.a',
  },
  {
    id: 'b',
    trigger: 'gallery.accordion.b',
    panel: 'gallery.accordionPanel.b',
  },
] as const satisfies readonly {
  id: string
  trigger: AdminMessageKey
  panel: AdminMessageKey
}[]

const SECTIONS: readonly GallerySection[] = [
  { id: 'actions', title: 'gallery.actions', hint: 'gallery.actionsHint' },
  { id: 'forms', title: 'gallery.forms', hint: 'gallery.formsHint' },
  { id: 'data', title: 'gallery.data', hint: 'gallery.dataHint' },
  {
    id: 'navigation',
    title: 'gallery.navigation',
    hint: 'gallery.navigationHint',
  },
  { id: 'states', title: 'gallery.states', hint: 'gallery.statesHint' },
]

/** The packages this page renders. Shown so a reader can check them. */
const PACKAGES = [
  'accordion',
  'alert',
  'avatar',
  'badge',
  'button',
  'checkbox',
  'dialog',
  'dropdown-menu',
  'input',
  'popover',
  'progress',
  'radio-group',
  'select',
  'separator',
  'skeleton',
  'switch',
  'tabs',
  'textarea',
  'toast',
  'tooltip',
] as const

export function ComponentsPage() {
  /*
   * The toast is driven through its own `show()` rather than a bound `open`.
   * `zw-toast` treats *any* `open` prop as controlled — including `false` — and
   * a controlled toast never changes its own state; it only emits
   * `open-change` and waits for the owner to write the prop back. Opening it
   * that way needs the round trip to complete before the next render, which is
   * a timing contract this page has no reason to depend on. `show()` is the
   * documented imperative API and does the same job in one call.
   */
  let toastElement: ToastElement | undefined
  const [tab, setTab] = createSignal<'one' | 'two' | 'three'>('one')
  const [accordion, setAccordion] = createSignal('a')
  const [progress, setProgress] = createSignal(40)
  const [name, setName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [submitted, setSubmitted] = createSignal(false)
  const [agree, setAgree] = createSignal(false)
  const [role, setRole] = createSignal<'viewer' | 'admin'>('viewer')
  const [plan, setPlan] = createSignal('team')
  const [notifications, setNotifications] = createSignal(true)
  const [menuChoice, setMenuChoice] = createSignal('')
  let dialogElement: DialogElement | undefined

  const emailError = () =>
    submitted() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email())

  function showToast(message: AdminMessageKey): void {
    const title = toastElement?.querySelector(
      '[data-testid="gallery-toast-title"]',
    )
    if (title) title.textContent = t(message)
    void toastElement?.show()
  }

  return (
    <section class="page gallery" data-testid="components-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">{t('gallery.title')}</h2>
          <p class="page-description">{t('gallery.description')}</p>
        </div>
      </header>

      {/*
        The packages actually on this page, stated plainly. A gallery that
        lists what it renders can be checked against `package.json`; one that
        does not invites exactly the drift this page was rebuilt to end.
      */}
      <p class="gallery-packages" data-testid="gallery-packages">
        {t('gallery.packages')}
        {': '}
        <code>@zeus-web/*</code> · {PACKAGES.join(', ')}
      </p>

      <nav
        class="gallery-nav"
        aria-label={t('gallery.sections')}
        data-testid="gallery-nav"
      >
        <For each={SECTIONS}>
          {section => (
            <a class="gallery-nav-link" href={`#gallery-${section.id}`}>
              {t(section.title)}
            </a>
          )}
        </For>
      </nav>

      {/* ------------------------------------------------------- actions */}
      <section
        class="gallery-section"
        id="gallery-actions"
        data-testid="gallery-actions"
      >
        <h3 class="gallery-title">{t('gallery.actions')}</h3>
        <p class="gallery-hint">{t('gallery.actionsHint')}</p>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.buttons')} <code>zw-button</code>
          </p>
          <div class="gallery-row">
            <zw-button
              data-testid="gallery-button-primary"
              variant="primary"
              onPress={() => showToast('gallery.savedToast')}
            >
              {t('gallery.primary')}
            </zw-button>
            <zw-button
              data-testid="gallery-button-secondary"
              variant="secondary"
            >
              {t('gallery.secondary')}
            </zw-button>
            <zw-button variant="outline">{t('gallery.outline')}</zw-button>
            <zw-button variant="ghost">{t('gallery.ghost')}</zw-button>
            <zw-button variant="danger">{t('gallery.destructive')}</zw-button>
            <zw-button disabled>{t('gallery.disabled')}</zw-button>
            <zw-button loading data-testid="gallery-button-loading">
              {t('gallery.loading')}
            </zw-button>
          </div>
        </article>

        {/*
          Dialog: the real element, so focus trapping, Escape and the modal
          backdrop are the component's behaviour, not the page's. `open` is
          bound and `onOpenChange` mirrors it, which also covers a close through
          Escape or the backdrop.
        */}
        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.dialog')} <code>zw-dialog</code>
          </p>
          <div class="gallery-row">
            {/*
              The dialog owns its open state. `open` is a controlled prop here
              too — passing it makes the element wait for the owner to write the
              value back — and a controlled dialog closed by Escape would need
              that round trip before it visibly closes. Letting the element own
              the state means Escape, the backdrop and the close control all
              behave the way the component defines them, which is the thing this
              page is here to show.
            */}
            <zw-dialog
              data-testid="gallery-dialog"
              {...withRef<DialogElement>(element => {
                dialogElement = element ?? undefined
              })}
            >
              {/*
                The trigger renders its own <button>; nesting a zw-button inside
                would produce a button inside a button, and the inner one is
                what a person cannot click. The label goes directly in.
              */}
              <zw-dialog-trigger data-testid="gallery-open-dialog">
                {t('gallery.openDialog')}
              </zw-dialog-trigger>
              <zw-dialog-content data-testid="gallery-dialog-content">
                <zw-dialog-title>{t('gallery.dialogTitle')}</zw-dialog-title>
                <zw-dialog-description>
                  {t('gallery.dialogCopy')}
                </zw-dialog-description>
                <div class="gallery-row gallery-dialog-actions">
                  <zw-dialog-close data-testid="gallery-cancel-dialog">
                    {t('common.cancel')}
                  </zw-dialog-close>
                  <zw-button
                    variant="primary"
                    data-testid="gallery-confirm-dialog"
                    onPress={() => {
                      dialogElement?.close()
                      showToast('gallery.confirmedToast')
                    }}
                  >
                    {t('gallery.confirm')}
                  </zw-button>
                </div>
              </zw-dialog-content>
            </zw-dialog>
          </div>
        </article>

        {/*
          Toast: a real live region with its own dismissal timer. The viewport
          is where the component puts fixed-position toasts, so it has to be
          present even while nothing is showing.
        */}
        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.toast')} <code>zw-toast</code>
          </p>
          <div class="gallery-row">
            <zw-button
              variant="outline"
              data-testid="gallery-toast-success"
              onPress={() => showToast('gallery.savedToast')}
            >
              {t('gallery.showSuccess')}
            </zw-button>
            <zw-button
              variant="outline"
              data-testid="gallery-toast-error"
              onPress={() => showToast('gallery.failedToast')}
            >
              {t('gallery.showError')}
            </zw-button>
          </div>
          <zw-toast-viewport>
            <zw-toast
              data-testid="gallery-toast"
              duration={8000}
              {...withRef<ToastElement>(element => {
                toastElement = element ?? undefined
              })}
            >
              {/*
                The title is written from `showToast`, not bound. A binding
                inside a custom element's light DOM is compiled for the page's
                own reactive scope, and the element only reads its slot when it
                renders — so a binding that changes while the toast is closed is
                not what the toast shows next. Assigning the text right before
                `show()` is the ordering the element actually depends on.
              */}
              <zw-toast-title data-testid="gallery-toast-title" />
              <zw-toast-close>
                <button type="button" class="gallery-toast-close">
                  {t('common.dismiss')}
                </button>
              </zw-toast-close>
            </zw-toast>
          </zw-toast-viewport>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.dropdown')} <code>zw-dropdown-menu</code>
          </p>
          <div class="gallery-row">
            <zw-dropdown-menu
              data-testid="gallery-dropdown"
              onSelect={(event: CustomEvent<{ value?: string }>) => {
                setMenuChoice(event.detail.value ?? '')
              }}
            >
              <zw-dropdown-menu-trigger data-testid="gallery-open-menu">
                {t('gallery.openMenu')}
              </zw-dropdown-menu-trigger>
              <zw-dropdown-menu-content>
                <zw-dropdown-menu-item
                  value="edit"
                  data-testid="gallery-menu-edit"
                >
                  <Icon name="edit" /> {t('gallery.menuEdit')}
                </zw-dropdown-menu-item>
                <zw-dropdown-menu-item value="duplicate">
                  <Icon name="copy" /> {t('gallery.menuDuplicate')}
                </zw-dropdown-menu-item>
                <zw-dropdown-menu-item value="delete">
                  <Icon name="trash" /> {t('gallery.menuDelete')}
                </zw-dropdown-menu-item>
              </zw-dropdown-menu-content>
            </zw-dropdown-menu>
            <Show when={menuChoice()}>
              <span class="muted" data-testid="gallery-menu-choice">
                {menuChoice()}
              </span>
            </Show>
          </div>
        </article>
      </section>

      {/* --------------------------------------------------------- forms */}
      <section
        class="gallery-section"
        id="gallery-forms"
        data-testid="gallery-forms"
      >
        <h3 class="gallery-title">{t('gallery.forms')}</h3>
        <p class="gallery-hint">{t('gallery.formsHint')}</p>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.textFields')} <code>zw-input</code>{' '}
            <code>zw-label</code>
          </p>
          <div class="gallery-form-grid">
            <div class="field">
              <zw-label for="gallery-name-input">{t('gallery.name')}</zw-label>
              <zw-input
                data-testid="gallery-name"
                id="gallery-name-input"
                placeholder={t('gallery.namePlaceholder')}
                onValueChange={(event: CustomEvent<{ value: string }>) =>
                  setName(event.detail.value ?? '')
                }
              />
            </div>
            <div class="field">
              <zw-label for="gallery-email-input">
                {t('gallery.email')}
              </zw-label>
              <zw-input
                data-testid="gallery-email"
                id="gallery-email-input"
                type="text"
                placeholder="ada@example.test"
                invalid={emailError()}
                onValueChange={(event: CustomEvent<{ value: string }>) =>
                  setEmail(event.detail.value ?? '')
                }
              />
            </div>
            <div class="field">
              <zw-label>{t('gallery.disabledField')}</zw-label>
              <zw-input disabled value={t('gallery.disabledValue')} />
            </div>
          </div>
          <div class="gallery-row">
            <zw-button
              variant="primary"
              data-testid="gallery-submit"
              onPress={() => setSubmitted(true)}
            >
              {t('gallery.validate')}
            </zw-button>
            <Show when={emailError()}>
              <span class="form-error" data-testid="gallery-email-error">
                {t('gallery.invalidEmail')}
              </span>
            </Show>
            <Show when={submitted() && !emailError()}>
              <span
                class="settings-saved"
                role="status"
                data-testid="gallery-form-ok"
              >
                {t('gallery.formValid')} {name()}
              </span>
            </Show>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.textarea')} <code>zw-textarea</code>
          </p>
          <zw-textarea
            data-testid="gallery-textarea"
            rows={3}
            placeholder={t('gallery.textareaPlaceholder')}
          />
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.select')} <code>zw-select</code>
          </p>
          <div class="gallery-row">
            <zw-select
              data-testid="gallery-select"
              ariaLabel={t('gallery.select')}
              value={plan()}
              onValueChange={(event: CustomEvent<{ value: string }>) =>
                setPlan(event.detail.value ?? 'team')
              }
            >
              <option value="personal">{t('users.roleViewer')}</option>
              <option value="team">{t('users.roleAdmin')}</option>
              <option value="enterprise">{t('gallery.enterprise')}</option>
            </zw-select>
            <zw-select ariaLabel={t('gallery.selectDisabled')} disabled>
              <option>{t('gallery.disabled')}</option>
            </zw-select>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.checkboxRadio')} <code>zw-checkbox</code>{' '}
            <code>zw-radio-group</code>
          </p>
          <div class="gallery-row">
            <zw-checkbox
              data-testid="gallery-checkbox"
              checked={agree()}
              onCheckedChange={(event: CustomEvent<{ checked: boolean }>) =>
                setAgree(event.detail.checked)
              }
            >
              {t('gallery.agree')}
            </zw-checkbox>
            <zw-checkbox disabled>{t('gallery.disabled')}</zw-checkbox>
          </div>
          <div class="gallery-row">
            <zw-radio-group
              data-testid="gallery-radio-group"
              ariaLabel={t('gallery.checkboxRadio')}
              value={role()}
              orientation="horizontal"
              onValueChange={(event: CustomEvent<{ value: string }>) =>
                setRole((event.detail.value as 'viewer' | 'admin') ?? 'viewer')
              }
            >
              <zw-radio-group-item value="viewer">
                {t('users.roleViewer')}
              </zw-radio-group-item>
              <zw-radio-group-item value="admin">
                {t('users.roleAdmin')}
              </zw-radio-group-item>
            </zw-radio-group>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.switch')} <code>zw-switch</code>
          </p>
          <div class="gallery-row">
            <zw-switch
              data-testid="gallery-switch"
              ariaLabel={t('gallery.switch')}
              checked={notifications()}
              onCheckedChange={(event: CustomEvent<{ checked: boolean }>) =>
                setNotifications(event.detail.checked)
              }
            >
              {t('gallery.notifications')}
            </zw-switch>
            <zw-switch ariaLabel={t('gallery.disabled')} disabled>
              {t('gallery.disabled')}
            </zw-switch>
          </div>
          <zw-separator />
        </article>
      </section>

      {/* ---------------------------------------------------------- data */}
      <section
        class="gallery-section"
        id="gallery-data"
        data-testid="gallery-data"
      >
        <h3 class="gallery-title">{t('gallery.data')}</h3>
        <p class="gallery-hint">{t('gallery.dataHint')}</p>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.badges')} <code>zw-badge</code>
          </p>
          <div class="gallery-row">
            <zw-badge variant="success" data-testid="gallery-badge-active">
              {t('status.active')}
            </zw-badge>
            <zw-badge variant="warning">{t('status.invited')}</zw-badge>
            <zw-badge variant="danger">{t('status.suspended')}</zw-badge>
            <zw-badge variant="outline">{t('gallery.outline')}</zw-badge>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.avatars')} <code>zw-avatar</code>
          </p>
          <div class="gallery-row gallery-avatars">
            <zw-avatar size="md">
              <zw-avatar-fallback>A</zw-avatar-fallback>
            </zw-avatar>
            <zw-avatar size="md">
              <zw-avatar-fallback>R</zw-avatar-fallback>
            </zw-avatar>
            <zw-avatar size="md" shape="square">
              <zw-avatar-fallback>G</zw-avatar-fallback>
            </zw-avatar>
            <zw-avatar size="lg">
              <zw-avatar-image
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%232451da'/%3E%3C/svg%3E"
                alt={t('gallery.avatarAlt')}
              />
              <zw-avatar-fallback>M</zw-avatar-fallback>
            </zw-avatar>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.progress')} <code>zw-progress</code>
          </p>
          <div class="gallery-row">
            <zw-progress
              data-testid="gallery-progress"
              label={t('gallery.progress')}
              max={100}
              value={progress()}
            />
            <zw-button
              variant="outline"
              size="sm"
              onPress={() => setProgress(Math.max(0, progress() - 20))}
            >
              −20
            </zw-button>
            <zw-button
              variant="outline"
              size="sm"
              onPress={() => setProgress(Math.min(100, progress() + 20))}
            >
              +20
            </zw-button>
            <span class="muted">{progress()}%</span>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.skeleton')} <code>zw-skeleton</code>
          </p>
          <div class="gallery-skeletons" data-testid="gallery-skeleton">
            <zw-skeleton variant="text" />
            <zw-skeleton variant="text" />
            <zw-skeleton variant="rect" />
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.dataTable')} <code>zw-data-grid</code>
          </p>
          {/*
            A minimal read-only grid. Admin's own tables add a status pill and a
            row menu through `shell/grid-decorations.ts`, a MutationObserver
            that decorates the grid's light DOM. That decoration is an
            application concern, not a component feature, so it is not repeated
            here — the gallery shows the component, the pages show the app.
          */}
          <zw-data-grid
            data-testid="gallery-grid"
            class="gallery-grid"
            {...withProp('columns', [
              { id: 'name', header: 'Name', width: 180 },
              { id: 'team', header: 'Team', width: 160 },
            ])}
            {...withProp('rows', [
              { id: '1', cells: { name: 'Ada', team: 'Platform' } },
              { id: '2', cells: { name: 'Grace', team: 'Infra' } },
            ])}
          />
        </article>
      </section>

      {/* ---------------------------------------------------- navigation */}
      <section
        class="gallery-section"
        id="gallery-navigation"
        data-testid="gallery-navigation"
      >
        <h3 class="gallery-title">{t('gallery.navigation')}</h3>
        <p class="gallery-hint">{t('gallery.navigationHint')}</p>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.tabs')} <code>zw-tabs</code>
          </p>
          <zw-tabs
            data-testid="gallery-tabs"
            value={tab()}
            onValueChange={(event: CustomEvent<{ value: string }>) =>
              setTab((event.detail.value as 'one' | 'two' | 'three') ?? 'one')
            }
          >
            <zw-tabs-list aria-label={t('gallery.tabs')}>
              <For each={TABS}>
                {entry => (
                  <zw-tabs-trigger
                    value={entry.id}
                    data-testid={`gallery-tab-${entry.id}`}
                  >
                    {t(entry.label)}
                  </zw-tabs-trigger>
                )}
              </For>
            </zw-tabs-list>
            <For each={TABS}>
              {entry => (
                <zw-tabs-content value={entry.id}>
                  <p data-testid={`gallery-tab-panel-${entry.id}`}>
                    {t(entry.panel)}
                  </p>
                </zw-tabs-content>
              )}
            </For>
          </zw-tabs>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.accordion')} <code>zw-accordion</code>
          </p>
          <zw-accordion
            data-testid="gallery-accordion"
            type="single"
            collapsible
            value={accordion()}
            onValueChange={(event: CustomEvent<{ value: string }>) =>
              setAccordion(event.detail.value ?? '')
            }
          >
            <For each={ACCORDION}>
              {entry => (
                <zw-accordion-item value={entry.id}>
                  <zw-accordion-trigger
                    data-testid={`gallery-accordion-${entry.id}`}
                  >
                    {t(entry.trigger)}
                  </zw-accordion-trigger>
                  <zw-accordion-content>
                    <p>{t(entry.panel)}</p>
                  </zw-accordion-content>
                </zw-accordion-item>
              )}
            </For>
          </zw-accordion>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.popover')} <code>zw-popover</code>
          </p>
          <zw-popover data-testid="gallery-popover">
            <zw-popover-trigger data-testid="gallery-popover-trigger">
              {t('gallery.openPopover')}
            </zw-popover-trigger>
            <zw-popover-content>
              <p class="gallery-popover-title">{t('gallery.popoverTitle')}</p>
              <p class="muted">{t('gallery.popoverCopy')}</p>
            </zw-popover-content>
          </zw-popover>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">
            {t('gallery.tooltip')} <code>zw-tooltip</code>
          </p>
          <zw-tooltip>
            <zw-tooltip-trigger data-testid="gallery-tooltip-trigger">
              {t('gallery.hoverMe')}
            </zw-tooltip-trigger>
            <zw-tooltip-content>{t('gallery.tooltipText')}</zw-tooltip-content>
          </zw-tooltip>
        </article>
      </section>

      {/* -------------------------------------------------------- states */}
      <section
        class="gallery-section"
        id="gallery-states"
        data-testid="gallery-states"
      >
        <h3 class="gallery-title">{t('gallery.states')}</h3>
        <p class="gallery-hint">{t('gallery.statesHint')}</p>

        <div class="gallery-state-grid">
          <article class="gallery-state">
            <p class="gallery-label">
              {t('gallery.loading')} <code>zw-skeleton</code>
            </p>
            <div class="gallery-skeletons" role="status">
              <zw-skeleton variant="text" />
              <zw-skeleton variant="text" />
            </div>
            <p class="gallery-state-note">{t('gallery.loadingCopy')}</p>
          </article>

          {/*
            No EmptyState component exists in Zeus UI. Admin's `.state-block`
            stays, and the badge says what it is: application markup, not a
            library component the reader could go and import.
          */}
          <article class="gallery-state">
            <p class="gallery-label">
              {t('gallery.empty')}
              <span class="gallery-native" data-testid="gallery-empty-native">
                {t('gallery.nativeBadge')}
              </span>
            </p>
            <div class="state-block" data-testid="gallery-empty">
              <Icon name="inbox" />
              <p class="state-title">{t('gallery.emptyTitle')}</p>
              <p class="state-description">{t('gallery.emptyCopy')}</p>
            </div>
          </article>

          <article class="gallery-state">
            <p class="gallery-label">
              {t('gallery.error')} <code>zw-alert</code>
            </p>
            <zw-alert
              variant="danger"
              live="assertive"
              data-testid="gallery-error"
            >
              <zw-alert-title>{t('gallery.errorTitle')}</zw-alert-title>
              <zw-alert-description>
                {t('gallery.errorCopy')}
              </zw-alert-description>
            </zw-alert>
          </article>

          <article class="gallery-state">
            <p class="gallery-label">
              {t('gallery.success')} <code>zw-alert</code>
            </p>
            <zw-alert
              variant="success"
              live="polite"
              data-testid="gallery-success"
            >
              <zw-alert-title>{t('gallery.successTitle')}</zw-alert-title>
              <zw-alert-description>
                {t('gallery.successCopy')}
              </zw-alert-description>
            </zw-alert>
          </article>

          <article class="gallery-state">
            <p class="gallery-label">
              {t('gallery.disabled')} <code>zw-button</code>{' '}
              <code>zw-input</code>
            </p>
            <div class="gallery-row">
              <zw-button variant="primary" disabled>
                {t('gallery.primary')}
              </zw-button>
              <zw-button variant="outline" disabled>
                {t('gallery.secondary')}
              </zw-button>
              <zw-input disabled value={t('gallery.disabledValue')} />
            </div>
          </article>
        </div>
      </section>
    </section>
  )
}
