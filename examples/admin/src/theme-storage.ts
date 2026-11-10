/**
 * One place that knows how a theme preference is stored.
 *
 * `shell/theme.ts` re-exports these so callers deal in the type-safe
 * preference; this module stays dependency-free to avoid an import cycle
 * between the theme helper and the shell.
 */

export type ThemePreference = 'light' | 'dark' | 'system'

const THEME_KEY = 'zeus-admin.theme'

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // Private mode: fall through to the default.
  }
  return 'system'
}

export function writeThemePreference(value: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, value)
  } catch {
    // Ignore; the session still reflects the choice.
  }
}
