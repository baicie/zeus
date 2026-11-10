/**
 * Theme preference helper used by the shell.
 *
 * Kept separate from storage so the shell imports a small, typed surface: the
 * preference type, the function that resolves it against the OS, and the
 * function that writes `<html data-theme>`.
 */

export type { ThemePreference } from '../theme-storage'

import { readThemePreference, writeThemePreference } from '../theme-storage'
import type { ThemePreference } from '../theme-storage'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Resolves `system` against the current OS preference. */
export function effectiveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** Writes the resolved theme onto `<html data-theme>`. */
export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = effectiveTheme(preference)
}

export { readThemePreference, writeThemePreference }
