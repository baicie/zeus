/**
 * UploadPage: one Admin page, in its own module so the router can load it on
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
import { errorMessage } from './shared'

export function UploadPage() {
  const [upload, setUpload] = createSignal<
    { id: string; filename: string; bytes: number; sha256: string } | undefined
  >(undefined)
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)

  async function submit(event: Event): Promise<void> {
    event.preventDefault()
    const input = (event.currentTarget as HTMLFormElement).querySelector(
      'input[type=file]',
    ) as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) {
      setError(t('upload.noFile'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const controller = new AbortController()
      setUpload(await adminApi.uploadFile(file, controller.signal))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section class="page" data-testid="upload-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">{t('upload.title')}</h2>
          <p class="page-description">{t('upload.description')}</p>
        </div>
      </header>

      <form onSubmit={submit} data-testid="upload-form" class="settings-form">
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">{t('upload.chooseFile')}</h3>
            <p class="card-description">{t('upload.chooseFileHint')}</p>
          </div>
          <div class="card-content settings-form">
            <div class="field">
              <label class="field-label" for="upload-file">
                {t('upload.file')}
              </label>
              <input
                id="upload-file"
                class="input"
                type="file"
                accept=".txt,.md,.json,.png"
              />
            </div>
            <Show when={error()}>
              <p class="form-error" role="alert" data-testid="upload-error">
                <Icon name="alert" /> {error()}
              </p>
            </Show>
            <Show when={upload()}>
              <div class="upload-result" data-testid="upload-result">
                <p class="row">
                  <Icon name="check" /> {t('upload.success')}
                </p>
                <dl class="detail-grid">
                  <div>
                    <dt>{t('upload.file')}</dt>
                    <dd>{upload()!.filename}</dd>
                  </div>
                  <div>
                    <dt>{t('upload.size')}</dt>
                    <dd>{upload()!.bytes} bytes</dd>
                  </div>
                  <div>
                    <dt>SHA-256</dt>
                    <dd
                      class="mono"
                      style={{ 'font-size': '12px', 'word-break': 'break-all' }}
                    >
                      {upload()!.sha256}
                    </dd>
                  </div>
                </dl>
              </div>
            </Show>
          </div>
          <div class="card-footer">
            <button type="submit" class="btn" disabled={busy()}>
              {busy() ? t('upload.uploading') : t('upload.submit')}
            </button>
          </div>
        </article>
      </form>
    </section>
  )
}

/**
 * Writes the server-persisted theme onto the document. The settings page owns
 * this because the value lives in SQLite; the shell's toggle owns only the
 * local preview preference.
 */
