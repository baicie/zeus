/**
 * The Admin console's localization.
 *
 * Two separate things select a language, and conflating them would be a bug:
 *
 * - **Personal display preference** — what *this person* wants to read. Stored
 *   per account in `localStorage`, so switching it never touches the server.
 * - **Workspace default** — what new members of this workspace start with. It
 *   is `WorkspaceSettings.locale` and only an administrator's explicit save in
 *   Settings changes it.
 *
 * The precedence is: personal preference, then the browser's own languages,
 * then the workspace default, then English. A user who has never chosen
 * anything follows their browser; a user who has chosen keeps that choice even
 * if an administrator later changes the workspace default.
 */

import { createI18n, negotiateLocale, type Locale } from '@zeus-js/i18n'

import { en, type AdminMessageKey } from './locales/en'
import { zhCN } from './locales/zh-CN'

export const i18n = createI18n<AdminMessageKey>({
  messages: { en, 'zh-CN': zhCN },
  initialLocale: 'en',
  // Set explicitly by `applyDocumentLang`, which also runs before the first
  // paint from a stored preference.
  syncDocumentLang: false,
})

export type { Locale }

/** `admin.locale` was a workspace-level setting, not a personal one. */
const PREFERENCE_PREFIX = 'zeus-admin.locale.'

function preferenceKey(userId: string): string {
  return `${PREFERENCE_PREFIX}${userId}`
}

/** Reads this account's stored choice, if any. Storage failures are silent. */
export function readPersonalLocale(userId: string): Locale | undefined {
  try {
    const value = localStorage.getItem(preferenceKey(userId))
    return value === 'en' || value === 'zh-CN' ? value : undefined
  } catch {
    // Private browsing and quota errors degrade to "no preference", which
    // falls through to the browser's languages rather than breaking sign-in.
    return undefined
  }
}

/**
 * Reads *any* stored preference, for the pre-login render.
 *
 * Before a session exists there is no account id to key on, so this returns the
 * most recent stored choice. It only decides the language of the sign-in card;
 * once the session resolves, `readPersonalLocale(user.id)` takes over and the
 * account's own preference wins.
 */
export function readStoredLocaleForAnyAccount(): Locale | undefined {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(PREFERENCE_PREFIX)) continue
      const value = localStorage.getItem(key)
      if (value === 'en' || value === 'zh-CN') return value
    }
    return undefined
  } catch {
    return undefined
  }
}

export function writePersonalLocale(userId: string, locale: Locale): void {
  try {
    localStorage.setItem(preferenceKey(userId), locale)
  } catch {
    // Memory-only for this session; the switch itself already applied.
  }
}

/**
 * Decides which language to show before the user has chosen one.
 *
 * `navigator.languages` is consulted in order, so a browser set to
 * `['zh-TW', 'en']` lands on English rather than being coerced into Simplified
 * Chinese. The workspace default is the last fallback before English: it is an
 * administrator's decision about the workspace, not about this person.
 */
export function resolveInitialLocale(
  workspaceDefault: unknown,
  browserLanguages: readonly string[] | undefined,
): Locale {
  const fromBrowser = negotiateLocale(browserLanguages)
  if (fromBrowser) return fromBrowser
  if (workspaceDefault === 'zh-CN' || workspaceDefault === 'en') {
    return workspaceDefault
  }
  return 'en'
}

/** Mirrors the active locale onto `<html lang>` for screen readers. */
export function applyDocumentLang(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
}

/**
 * Switches the interface language and remembers it for this account.
 *
 * Deliberately does **not** call `updateSettings`. A personal display choice
 * must not rewrite the workspace default — that would silently change what
 * everyone else sees, and would make an ordinary preference change an
 * administrative act.
 */
export async function changePersonalLocale(
  userId: string,
  locale: Locale,
): Promise<void> {
  await i18n.setLocale(locale)
  writePersonalLocale(userId, locale)
  applyDocumentLang(locale)
}

/**
 * Typed shorthand. The key is `AdminMessageKey`, so a typo — or a key that was
 * removed from the catalog — is a compile error rather than a rendered key.
 */
export function t(
  key: AdminMessageKey,
  params?: Parameters<typeof i18n.t>[1],
): string {
  return i18n.t(key, params)
}
