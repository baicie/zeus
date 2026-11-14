/**
 * SettingsPage: one Admin page, in its own module so the router can load it on
 * demand. Split out of `pages.tsx` without changing the page body.
 */

import { Link, useParams, useRouteError, useRouter } from '@zeus-js/router'
import { useMutation, useQuery, useQueryClient } from '@zeus-js/query'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from '@zeus-js/zeus'
import type { DataGridElement } from '@zeus-web/data-grid/wc'
import type { InputElement } from '@zeus-web/input/wc'

import {
  adminSummaryQueryKey,
  adminUserQueryKey,
  USER_LIST_STALE_TIME,
  USER_PAGE_SIZE,
  userListQueryKey,
  type AdminSummary,
  type AdminAuditEvent,
  type AdminRoleRecord,
  type Role,
  type SessionUser,
  type User,
  type UserPatch,
  type UserStatus,
} from '../routes'
import type { WorkspaceSettings } from '../api'
import { adminApi, isDemoBuild } from '../admin-api'
import { Icon } from '../shell/icon'
import { decorateUserGrid } from '../shell/grid-decorations'
import { changePersonalLocale, i18n, t, type Locale } from '../i18n'
import { useSession } from '../session'
import { applyTheme, errorMessage } from './shared'

export function SettingsPage() {
  const session = useSession()
  const [settings, setSettings] = createSignal<WorkspaceSettings | undefined>(
    undefined,
  )
  const [status, setStatus] = createSignal('')
  const [error, setError] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  // Selects are controlled here, not by `selected` attributes: a save writes a
  // new settings object and the `<select>` must follow it without the DOM
  // keeping a stale option.
  const [locale, setLocale] = createSignal<WorkspaceSettings['locale']>('zh-CN')
  const [theme, setTheme] = createSignal<WorkspaceSettings['theme']>('light')

  createEffect(() => {
    const controller = new AbortController()
    adminApi
      .getSettings(controller.signal)
      .then(value => {
        setSettings(value)
        setLocale(value.locale)
        setTheme(value.theme)
        applyTheme(value.theme)
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(errorMessage(cause))
      })
    onCleanup(() => controller.abort())
  })

  async function save(event: Event): Promise<void> {
    event.preventDefault()
    const current = settings()
    if (!current) return
    setSaving(true)
    setError('')
    setStatus('')
    const controller = new AbortController()
    try {
      const next = await adminApi.updateSettings(current, controller.signal)
      setSettings(next)
      setLocale(next.locale)
      setTheme(next.theme)
      applyTheme(next.theme)
      setStatus(t('settings.saved'))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  function patch<K extends keyof WorkspaceSettings>(
    key: K,
    value: WorkspaceSettings[K],
  ): void {
    setSettings(current => (current ? { ...current, [key]: value } : current))
  }

  return (
    <section class="page" data-testid="settings-page">
      <div class="settings-intro">
        <h2 class="settings-title">{t('settings.title')}</h2>
        <p class="settings-description">{t('settings.description')}</p>
      </div>
      <div class="separator" role="separator" />

      <Show
        when={settings()}
        fallback={
          <div class="settings-form">
            <div class="skeleton skeleton-line" style={{ height: '36px' }} />
            <div class="skeleton skeleton-line" style={{ height: '36px' }} />
            <div class="skeleton skeleton-line" style={{ height: '36px' }} />
          </div>
        }
      >
        <div class="settings-layout">
          <aside class="settings-nav">
            <ul class="settings-nav-list">
              <li>
                <a
                  class="btn btn-ghost btn-sm settings-nav-link"
                  aria-current="page"
                  href="#workspace"
                >
                  <Icon name="settings" /> {t('settings.sectionWorkspace')}
                </a>
              </li>
              <li>
                <a
                  class="btn btn-ghost btn-sm settings-nav-link"
                  href="#appearance"
                >
                  <Icon name="theme" /> {t('settings.sectionAppearance')}
                </a>
              </li>
              <li>
                <Link
                  class="btn btn-ghost btn-sm settings-nav-link"
                  to="/admin/upload"
                >
                  <Icon name="upload" /> {t('settings.sectionUpload')}
                </Link>
              </li>
            </ul>
          </aside>

          <div class="settings-content">
            <div>
              <h3 class="settings-section-title" id="workspace">
                {t('settings.sectionWorkspace')}
              </h3>
              <p class="settings-section-desc">{t('settings.allMembers')}</p>
            </div>
            <div class="separator" role="separator" />
            <form class="settings-form" onSubmit={save} id="workspace-form">
              <div class="settings-field-group">
                <label class="field-label" for="workspace-name">
                  {t('settings.workspaceName')}
                </label>
                <input
                  id="workspace-name"
                  class="input"
                  value={settings()!.workspaceName}
                  onInput={event =>
                    patch(
                      'workspaceName',
                      (event.currentTarget as HTMLInputElement).value,
                    )
                  }
                />
                <p class="field-hint">{t('settings.workspaceNameHint')}</p>
              </div>
              <div class="settings-field-group">
                <label class="field-label" for="personal-locale">
                  {t('settings.personalLanguage')}
                </label>
                <select
                  id="personal-locale"
                  class="select"
                  data-testid="personal-locale"
                  value={i18n.locale()}
                  onChange={event => {
                    const value = (event.currentTarget as HTMLSelectElement)
                      .value as Locale
                    // Personal only: this must never reach
                    // `adminApi.updateSettings`, or a private display choice
                    // would silently change what every member sees.
                    void changePersonalLocale(
                      session.user?.id ?? 'anonymous',
                      value,
                    )
                  }}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                </select>
                <p class="field-hint">{t('settings.personalLanguageHint')}</p>
              </div>
              <div class="settings-field-group">
                <label class="field-label" for="workspace-locale">
                  {t('settings.workspaceLanguage')}
                </label>
                <select
                  id="workspace-locale"
                  class="select"
                  data-testid="workspace-locale"
                  value={locale()}
                  onChange={event => {
                    const value = (event.currentTarget as HTMLSelectElement)
                      .value as WorkspaceSettings['locale']
                    setLocale(value)
                    patch('locale', value)
                  }}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                </select>
                <p class="field-hint">{t('settings.workspaceLanguageHint')}</p>
              </div>
              <div class="settings-field-group" id="appearance">
                <label class="field-label" for="workspace-theme">
                  {t('settings.theme')}
                </label>
                <select
                  id="workspace-theme"
                  class="select"
                  value={theme()}
                  onChange={event => {
                    const value = (event.currentTarget as HTMLSelectElement)
                      .value as WorkspaceSettings['theme']
                    setTheme(value)
                    patch('theme', value)
                  }}
                >
                  <option value="light">{t('settings.themeLight')}</option>
                  <option value="dark">{t('settings.themeDark')}</option>
                </select>
                <p class="field-hint">{t('settings.themeHint')}</p>
              </div>
              <div class="settings-actions">
                <button type="submit" class="btn" disabled={saving()}>
                  {saving() ? t('users.saving') : t('settings.saveSettings')}
                </button>
                <Show when={status()}>
                  <span
                    class="settings-saved"
                    role="status"
                    data-testid="settings-status"
                  >
                    <Icon name="check" /> {status()}
                  </span>
                </Show>
                <Show when={error()}>
                  <span
                    class="form-error"
                    role="alert"
                    data-testid="settings-error"
                  >
                    <Icon name="alert" /> {error()}
                  </span>
                </Show>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </section>
  )
}

/* ----------------------------------------------------------------- upload */
