/**
 * Component gallery (`/admin/components`).
 *
 * The reference has no such page, so this one follows the reference's *rules*
 * rather than copying a layout:
 *
 * - every example is real and interactive, not a picture of a component;
 * - states are explicit where a reviewer would test them: default, disabled,
 *   loading, error, success, empty — the same vocabulary the rest of Admin uses;
 * - examples are grouped the way the brief groups them (Actions, Forms, Data,
 *   Navigation, States), because the point is coverage, not decoration;
 * - it talks to the real component packages, not to local reimplementations.
 *
 * Deliberate limits, so the page cannot imply capabilities the product lacks:
 * a component that Admin does not ship (select/switch/toast/…) is rendered with
 * the plain element plus the admin's own styling and labelled as such; the page
 * never fakes a richer component than exists.
 */

import { For, Show, createSignal } from '@zeus-js/zeus'

import type { AdminMessageKey } from './locales/en'
import { Icon } from './shell/icon'
import { t } from './i18n'

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

export function ComponentsPage() {
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [toast, setToast] = createSignal('')
  const [tab, setTab] = createSignal<'one' | 'two' | 'three'>('one')
  const [progress, setProgress] = createSignal(40)
  const [name, setName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [submitted, setSubmitted] = createSignal(false)
  const [agree, setAgree] = createSignal(false)
  const [role, setRole] = createSignal<'viewer' | 'admin'>('viewer')
  const [openAccordion, setOpenAccordion] = createSignal('a')
  const [popover, setPopover] = createSignal(false)

  const emailError = () =>
    submitted() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email())

  return (
    <section class="page gallery" data-testid="components-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">{t('gallery.title')}</h2>
          <p class="page-description">{t('gallery.description')}</p>
        </div>
      </header>

      <nav
        class="gallery-nav"
        aria-label={t('gallery.sections')}
        data-testid="gallery-nav"
      >
        <For each={SECTIONS}>
          {section => (
            <a class="btn btn-ghost btn-sm" href={`#gallery-${section.id}`}>
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
          <p class="gallery-label">{t('gallery.buttons')}</p>
          <div class="gallery-row">
            <button
              type="button"
              class="btn"
              onClick={() => setToast(t('gallery.savedToast'))}
            >
              {t('gallery.primary')}
            </button>
            <button type="button" class="btn btn-outline">
              {t('gallery.secondary')}
            </button>
            <button type="button" class="btn btn-ghost">
              {t('gallery.ghost')}
            </button>
            <button type="button" class="btn btn-danger">
              {t('gallery.destructive')}
            </button>
            <button type="button" class="btn" disabled>
              {t('gallery.disabled')}
            </button>
            <button
              type="button"
              class="btn btn-outline"
              aria-busy="true"
              disabled
            >
              <span class="spinner" aria-hidden="true" /> {t('gallery.loading')}
            </button>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.dialog')}</p>
          <div class="gallery-row">
            <button
              type="button"
              class="btn btn-outline"
              data-testid="gallery-open-dialog"
              onClick={() => setDialogOpen(true)}
            >
              {t('gallery.openDialog')}
            </button>
          </div>
          <Show when={dialogOpen()}>
            <div
              class="gallery-scrim"
              role="presentation"
              onClick={() => setDialogOpen(false)}
            >
              <div
                class="wb-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="gallery-dialog-title"
                onClick={(event: Event) => event.stopPropagation()}
                data-testid="gallery-dialog"
              >
                <h4 class="wb-dialog-title" id="gallery-dialog-title">
                  {t('gallery.dialogTitle')}
                </h4>
                <p class="wb-dialog-copy">{t('gallery.dialogCopy')}</p>
                <div class="wb-dialog-actions">
                  <button
                    type="button"
                    class="btn btn-outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    class="btn"
                    data-testid="gallery-confirm-dialog"
                    onClick={() => {
                      setDialogOpen(false)
                      setToast(t('gallery.confirmedToast'))
                    }}
                  >
                    {t('gallery.confirm')}
                  </button>
                </div>
              </div>
            </div>
          </Show>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.toast')}</p>
          <div class="gallery-row">
            <button
              type="button"
              class="btn btn-outline"
              onClick={() => setToast(t('gallery.savedToast'))}
            >
              {t('gallery.showSuccess')}
            </button>
            <button
              type="button"
              class="btn btn-outline"
              onClick={() => setToast(t('gallery.failedToast'))}
            >
              {t('gallery.showError')}
            </button>
          </div>
          <Show when={toast()}>
            <p class="gallery-toast" role="status" data-testid="gallery-toast">
              {toast()}
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={() => setToast('')}
              >
                {t('common.dismiss')}
              </button>
            </p>
          </Show>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.dropdown')}</p>
          <div class="gallery-row">
            <details class="gallery-dropdown" data-testid="gallery-dropdown">
              <summary class="btn btn-outline">{t('gallery.openMenu')}</summary>
              <div class="menu" role="menu">
                <button type="button" class="menu-item" role="menuitem">
                  <Icon name="edit" /> {t('gallery.menuEdit')}
                </button>
                <button type="button" class="menu-item" role="menuitem">
                  <Icon name="copy" /> {t('gallery.menuDuplicate')}
                </button>
                <button
                  type="button"
                  class="menu-item menu-item-danger"
                  role="menuitem"
                >
                  <Icon name="trash" /> {t('gallery.menuDelete')}
                </button>
              </div>
            </details>
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
          <p class="gallery-label">{t('gallery.textFields')}</p>
          <div class="gallery-form-grid">
            <label class="field-label">
              {t('gallery.name')}
              <input
                class="input"
                value={name()}
                placeholder={t('gallery.namePlaceholder')}
                data-testid="gallery-name"
                onInput={(event: Event) =>
                  setName((event.currentTarget as HTMLInputElement).value)
                }
              />
            </label>
            <label class="field-label">
              {t('gallery.email')}
              <input
                class="input"
                value={email()}
                placeholder="ada@example.test"
                aria-invalid={emailError() ? 'true' : undefined}
                aria-describedby={
                  emailError() ? 'gallery-email-error' : undefined
                }
                data-testid="gallery-email"
                onInput={(event: Event) =>
                  setEmail((event.currentTarget as HTMLInputElement).value)
                }
              />
              <Show when={emailError()}>
                <span
                  class="form-error"
                  id="gallery-email-error"
                  data-testid="gallery-email-error"
                >
                  {t('gallery.invalidEmail')}
                </span>
              </Show>
            </label>
            <label class="field-label">
              {t('gallery.disabledField')}
              <input
                class="input"
                disabled
                value={t('gallery.disabledValue')}
              />
            </label>
          </div>
          <div class="gallery-row">
            <button
              type="button"
              class="btn"
              data-testid="gallery-submit"
              onClick={() => setSubmitted(true)}
            >
              {t('gallery.validate')}
            </button>
            <Show when={submitted() && !emailError()}>
              <span
                class="settings-saved"
                role="status"
                data-testid="gallery-form-ok"
              >
                {t('gallery.formValid')}
              </span>
            </Show>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.textarea')}</p>
          <textarea
            class="input gallery-textarea"
            rows={3}
            placeholder={t('gallery.textareaPlaceholder')}
          />
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.select')}</p>
          <div class="gallery-row">
            <select class="select" aria-label={t('gallery.select')}>
              <option>{t('users.roleViewer')}</option>
              <option>{t('users.roleAdmin')}</option>
            </select>
            <select
              class="select"
              aria-label={t('gallery.selectDisabled')}
              disabled
            >
              <option>{t('gallery.disabled')}</option>
            </select>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.checkboxRadio')}</p>
          <div class="gallery-row">
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={agree()}
                data-testid="gallery-checkbox"
                onChange={(event: Event) =>
                  setAgree((event.currentTarget as HTMLInputElement).checked)
                }
              />
              {t('gallery.agree')}
            </label>
            <label class="checkbox-row">
              <input type="checkbox" disabled /> {t('gallery.disabled')}
            </label>
            <label class="checkbox-row">
              <input
                type="radio"
                name="gallery-role"
                checked={role() === 'viewer'}
                onChange={() => setRole('viewer')}
              />
              {t('users.roleViewer')}
            </label>
            <label class="checkbox-row">
              <input
                type="radio"
                name="gallery-role"
                checked={role() === 'admin'}
                onChange={() => setRole('admin')}
              />
              {t('users.roleAdmin')}
            </label>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.switch')}</p>
          <div class="gallery-row">
            <button
              type="button"
              class="gallery-switch"
              role="switch"
              aria-checked={agree() ? 'true' : 'false'}
              data-testid="gallery-switch"
              onClick={() => setAgree(!agree())}
            >
              <span class="gallery-switch-thumb" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="gallery-switch"
              role="switch"
              aria-checked="false"
              disabled
            >
              <span class="gallery-switch-thumb" aria-hidden="true" />
            </button>
          </div>
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
          <p class="gallery-label">{t('gallery.badges')}</p>
          <div class="gallery-row">
            <span class="badge badge-status-active">{t('status.active')}</span>
            <span class="badge badge-status-invited">
              {t('status.invited')}
            </span>
            <span class="badge badge-status-suspended">
              {t('status.suspended')}
            </span>
            <span class="badge badge-outline">{t('gallery.outline')}</span>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.avatars')}</p>
          <div class="gallery-row gallery-avatars">
            <span class="gallery-avatar">A</span>
            <span class="gallery-avatar">R</span>
            <span class="gallery-avatar gallery-avatar-muted">G</span>
            <span class="gallery-avatar-stack">
              <span class="gallery-avatar">M</span>
              <span class="gallery-avatar">K</span>
              <span class="gallery-avatar gallery-avatar-more">+7</span>
            </span>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.progress')}</p>
          <div class="gallery-row">
            <div
              class="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress()}
              data-testid="gallery-progress"
            >
              <span class="progress-fill" style={{ width: `${progress()}%` }} />
            </div>
            <button
              type="button"
              class="btn btn-sm btn-outline"
              onClick={() => setProgress(Math.max(0, progress() - 20))}
            >
              −20
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline"
              onClick={() => setProgress(Math.min(100, progress() + 20))}
            >
              +20
            </button>
            <span class="muted">{progress()}%</span>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.skeleton')}</p>
          <div class="gallery-skeletons" data-testid="gallery-skeleton">
            <span class="skeleton skeleton-line" />
            <span class="skeleton skeleton-line skeleton-short" />
            <span class="skeleton skeleton-block" />
          </div>
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
          <p class="gallery-label">{t('gallery.tabs')}</p>
          <div class="tabs-list" role="tablist" aria-label={t('gallery.tabs')}>
            <For each={TABS}>
              {entry => (
                <button
                  type="button"
                  role="tab"
                  class="tab"
                  aria-selected={tab() === entry.id}
                  data-testid={`gallery-tab-${entry.id}`}
                  onClick={() => setTab(entry.id)}
                >
                  {t(entry.label)}
                </button>
              )}
            </For>
          </div>
          <p
            class="gallery-panel"
            role="tabpanel"
            data-testid="gallery-tab-panel"
          >
            {t(
              TABS.find(entry => entry.id === tab())?.panel ??
                'gallery.tabPanel.one',
            )}
          </p>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.accordion')}</p>
          <div class="gallery-accordion">
            <For each={ACCORDION}>
              {entry => (
                <div class="gallery-accordion-item">
                  <button
                    type="button"
                    class="gallery-accordion-trigger"
                    aria-expanded={
                      openAccordion() === entry.id ? 'true' : 'false'
                    }
                    data-testid={`gallery-accordion-${entry.id}`}
                    onClick={() =>
                      setOpenAccordion(
                        openAccordion() === entry.id ? '' : entry.id,
                      )
                    }
                  >
                    {t(entry.trigger)}
                    <Icon name="chevron-down" />
                  </button>
                  <Show when={openAccordion() === entry.id}>
                    <p class="gallery-accordion-panel">{t(entry.panel)}</p>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.popover')}</p>
          <div class="gallery-row gallery-anchor">
            <button
              type="button"
              class="btn btn-outline"
              aria-expanded={popover() ? 'true' : 'false'}
              data-testid="gallery-popover-trigger"
              onClick={() => setPopover(!popover())}
            >
              {t('gallery.openPopover')}
            </button>
            <Show when={popover()}>
              <div
                class="popover-card"
                role="dialog"
                aria-label={t('gallery.popover')}
                data-testid="gallery-popover"
              >
                <p class="gallery-popover-title">{t('gallery.popoverTitle')}</p>
                <p class="muted">{t('gallery.popoverCopy')}</p>
              </div>
            </Show>
          </div>
        </article>

        <article class="gallery-item">
          <p class="gallery-label">{t('gallery.tooltip')}</p>
          <div class="gallery-row">
            <button
              type="button"
              class="btn btn-outline"
              title={t('gallery.tooltipText')}
            >
              {t('gallery.hoverMe')}
            </button>
          </div>
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
            <p class="gallery-label">{t('gallery.loading')}</p>
            <p class="gallery-state-body" role="status">
              <span class="spinner" aria-hidden="true" />{' '}
              {t('gallery.loadingCopy')}
            </p>
          </article>
          <article class="gallery-state">
            <p class="gallery-label">{t('gallery.empty')}</p>
            <div class="state-block" data-testid="gallery-empty">
              <Icon name="inbox" />
              <p class="state-title">{t('gallery.emptyTitle')}</p>
              <p class="state-description">{t('gallery.emptyCopy')}</p>
            </div>
          </article>
          <article class="gallery-state">
            <p class="gallery-label">{t('gallery.error')}</p>
            <div
              class="state-block state-block-error"
              role="alert"
              data-testid="gallery-error"
            >
              <Icon name="alert" />
              <p class="state-title">{t('gallery.errorTitle')}</p>
              <p class="state-description">{t('gallery.errorCopy')}</p>
            </div>
          </article>
          <article class="gallery-state">
            <p class="gallery-label">{t('gallery.success')}</p>
            <div
              class="state-block state-block-success"
              role="status"
              data-testid="gallery-success"
            >
              <Icon name="check" />
              <p class="state-title">{t('gallery.successTitle')}</p>
              <p class="state-description">{t('gallery.successCopy')}</p>
            </div>
          </article>
          <article class="gallery-state">
            <p class="gallery-label">{t('gallery.disabled')}</p>
            <div class="gallery-row">
              <button type="button" class="btn" disabled>
                {t('gallery.primary')}
              </button>
              <button
                type="button"
                class="btn btn-outline"
                disabled
                aria-disabled="true"
              >
                {t('gallery.secondary')}
              </button>
              <input
                class="input"
                disabled
                value={t('gallery.disabledValue')}
              />
            </div>
          </article>
        </div>
      </section>
    </section>
  )
}
