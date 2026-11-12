/**
 * Helpers shared by more than one Admin page.
 *
 * Extracted from `pages.tsx` when the pages were split into lazy chunks, so
 * that a page importing a badge or a form helper does not pull in every other
 * page through a shared module.
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

export function applyTheme(theme: WorkspaceSettings['theme']): void {
  document.documentElement.dataset.theme = theme
}

export function errorStatus(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error)
    return String(error.status)
  return t('error.loadFailed')
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'data' in error)
    return String(error.data)
  return t('error.loadFailedHint')
}

export function useSummaryQuery() {
  return useQuery<AdminSummary>({
    queryKey: adminSummaryQueryKey,
    queryFn: ({ signal }) => adminApi.getSummary(signal),
    staleTime: 5_000,
    retry: false,
  })
}

/** Human-readable heading for a loader error status. */
export function errorHeading(status: string): string {
  switch (status) {
    case '403':
      return t('error.forbidden')
    case '404':
      return t('error.notFound')
    case '500':
      return t('error.serverError')
    default:
      return t('error.loadFailed')
  }
}

/**
 * Audit outcome pill. Only three outcomes exist in the schema; anything else
 * is rendered as-is so a new server value is still visible.
 */
export function OutcomeBadge(props: { outcome: string }) {
  const tone = () =>
    props.outcome === 'success'
      ? 'audit-outcome-success'
      : props.outcome === 'denied' || props.outcome === 'failure'
        ? 'audit-outcome-denied'
        : 'audit-outcome-neutral'
  const icon = () =>
    props.outcome === 'success'
      ? 'check'
      : props.outcome === 'denied' || props.outcome === 'failure'
        ? 'alert'
        : 'clock'
  return (
    <span class={`audit-outcome ${tone()}`}>
      <Icon name={icon()} /> {props.outcome}
    </span>
  )
}

/**
 * Status pill for a member. The label carries the meaning and the colour
 * reinforces it, so the state is never conveyed by colour alone.
 */
export function StatusBadge(props: { status: UserStatus | undefined }) {
  const meta = () => {
    switch (props.status) {
      case 'active':
        return { label: t('status.active'), tone: 'badge-status-active' }
      case 'invited':
        return { label: t('status.invited'), tone: 'badge-status-invited' }
      case 'suspended':
        return { label: t('status.suspended'), tone: 'badge-status-suspended' }
      default:
        return { label: t('status.unknown'), tone: 'badge-outline' }
    }
  }
  return <span class={`badge ${meta().tone}`}>{meta().label}</span>
}

/**
 * Writes a field's initial value exactly once, on mount.
 *
 * `ref` callbacks run after the element exists and, unlike a `value={…}` JSX
 * binding, create no reactive dependency: later renders never overwrite what
 * the user typed. The element is marked so a re-run of the callback (defensive
 * unmount/remount of the same node) cannot clobber user input either.
 */
export function seedValue(
  element: HTMLInputElement | HTMLSelectElement | null,
  value: string,
): void {
  if (!element) return
  if (element.dataset.seeded === 'true') return
  element.value = value
  element.dataset.seeded = 'true'
}

/** Keeps only the fields whose value differs from the loaded user. */
export function changedFields(
  current: User | undefined,
  next: UserPatch,
): UserPatch {
  const patch: Record<string, string> = {}
  if (!current) return next
  if (next.email !== undefined && next.email !== current.email)
    patch.email = next.email
  if (next.name !== undefined && next.name !== current.name)
    patch.name = next.name
  if (next.team !== undefined && next.team !== current.team)
    patch.team = next.team
  if (next.status !== undefined && next.status !== current.status)
    patch.status = next.status
  if (next.role !== undefined && next.role !== current.role)
    patch.role = next.role
  return patch as UserPatch
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  // The server requires a lowercase id; a Chinese-only name would produce an
  // empty slug, so fall back to a stable random id.
  return slug || `user-${crypto.randomUUID().slice(0, 8)}`
}
