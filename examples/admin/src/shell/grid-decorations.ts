/**
 * Grid decorations.
 *
 * The published `@zeus-web/data-grid` beta.33 renders rows and cells but no
 * per-row affordances. shadcn-admin's user table has two that matter for the
 * page to read correctly: a status pill in the status column and a "…" row
 * action button that opens a dropdown.
 *
 * This module adds both **without forking the component**: a MutationObserver
 * watches the host's light DOM (where the grid renders) and decorates cells by
 * `data-column-id`. The grid keeps owning selection, keyboard navigation and
 * virtualization; the decorations are pure DOM additions inside cells it has
 * already sized.
 *
 * The decoration is idempotent: it only writes when the rendered value is out
 * of date, so scrolling and re-renders do not churn.
 */

import type { DataGridElement } from '@zeus-web/data-grid/wc'

interface DecorateOptions {
  /** Opens the row menu at the button's position. */
  readonly onAction: (rowKey: string, point: { x: number; y: number }) => void
  /** Viewers never get the destructive action, so the button is hidden. */
  readonly isAdmin: () => boolean
  /**
   * Localized status labels.
   *
   * Passed in rather than imported so this module stays a DOM decorator with no
   * dependency on the i18n instance — and so a language switch can hand it a
   * new map and re-decorate without rebuilding the grid.
   */
  readonly statusLabels: () => Readonly<Record<string, string>>
}

const STATUS_CLASSES: Record<string, string> = {
  active: 'badge badge-status-active',
  invited: 'badge badge-status-invited',
  suspended: 'badge badge-status-suspended',
}

/**
 * Applies decorations and keeps applying them as the grid reconciles rows.
 * Returns a disposer that stops observing and removes listeners.
 */
export function decorateUserGrid(
  grid: DataGridElement,
  options: DecorateOptions,
): () => void {
  const observer = new MutationObserver(() => decorate())
  observer.observe(grid, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  function decorate(): void {
    for (const cell of grid.querySelectorAll<HTMLElement>(
      '[data-slot="data-grid-cell"][data-column-id="status"]',
    )) {
      decorateStatus(cell)
    }
    for (const cell of grid.querySelectorAll<HTMLElement>(
      '[data-slot="data-grid-cell"][data-column-id="actions"]',
    )) {
      decorateActions(cell)
    }
  }

  function decorateStatus(cell: HTMLElement): void {
    const raw = (cell.textContent ?? '').trim()
    if (!raw) return
    const wanted = options.statusLabels()[raw] ?? raw
    const existing = cell.querySelector<HTMLElement>(':scope > .badge')
    if (existing) {
      if (existing.textContent !== wanted) existing.textContent = wanted
      const className = STATUS_CLASSES[raw] ?? 'badge badge-outline'
      if (existing.className !== className) existing.className = className
      return
    }
    // The value cell is replaced by the pill; the raw value stays in the
    // title so a hover or screen reader still sees exactly what the server
    // returned.
    cell.textContent = ''
    const pill = document.createElement('span')
    pill.className = STATUS_CLASSES[raw] ?? 'badge badge-outline'
    pill.textContent = wanted
    pill.title = raw
    cell.append(pill)
  }

  function decorateActions(cell: HTMLElement): void {
    if (!options.isAdmin()) {
      cell.replaceChildren()
      return
    }
    const row = cell.closest<HTMLElement>('[data-slot="data-grid-row"]')
    const rowKey = row?.getAttribute('data-row-key') ?? ''
    if (!rowKey) return
    let button = cell.querySelector<HTMLButtonElement>(':scope > button')
    if (!button) {
      cell.textContent = ''
      button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn btn-ghost btn-sm btn-icon row-action'
      button.setAttribute('aria-label', '行操作')
      button.dataset.rowKey = rowKey
      button.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle></svg>'
      button.addEventListener('click', event => {
        event.stopPropagation()
        const rect = button!.getBoundingClientRect()
        options.onAction(button!.dataset.rowKey ?? '', {
          x: Math.min(rect.left, window.innerWidth - 200),
          y: rect.bottom + 4,
        })
      })
      cell.append(button)
    } else if (button.dataset.rowKey !== rowKey) {
      button.dataset.rowKey = rowKey
    }
  }

  decorate()

  return () => {
    observer.disconnect()
  }
}
