/**
 * English catalog — the key source of truth for the Admin console.
 *
 * Keys are flat and namespaced by surface (`nav.*`, `common.*`, `users.*`, …).
 * A key that only exists here is a compile error in the Chinese catalog, which
 * is what keeps the two from drifting.
 */
export const en = {
  /* ---------------------------------------------------------------- common */
  'common.loading': 'Loading…',
  'common.search': 'Search',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.retry': 'Retry',
  'common.back': 'Back',
  'common.confirm': 'Confirm',
  'common.path': 'Path',
  'common.match': 'Match',

  /* ------------------------------------------------------------ navigation */
  'nav.main': 'Main navigation',
  'nav.open': 'Open navigation',
  'nav.close': 'Close navigation',
  'nav.expandSidebar': 'Expand sidebar',
  'nav.collapseSidebar': 'Collapse sidebar',
  'nav.accountMenu': 'Account menu',
  'nav.breadcrumb': 'Breadcrumb',
  'nav.pageNavigation': 'Page navigation',
  'nav.searchPages': 'Search pages',
  'nav.searchPlaceholder': 'Search pages…',
  'nav.noMatch': 'No matching page.',
  'nav.preloading': 'Preloading…',
  'nav.notPreloaded': 'Not preloaded',

  /* --------------------------------------------------------------- groups */
  'nav.group.general': 'General',
  'nav.group.administration': 'Administration',
  'nav.group.workspace': 'Workspace',

  /* ----------------------------------------------------------------- pages */
  'nav.overview': 'Overview',
  'nav.users': 'Users',
  'nav.roles': 'Roles & permissions',
  'nav.audit': 'Audit log',
  'nav.reports': 'Reports',
  'nav.upload': 'File upload',
  'nav.settings': 'Settings',
  'nav.pages': 'Pages',
  'nav.users.short': 'Users',
  'nav.reports.short': 'Reports',

  /* ---------------------------------------------------------------- roles */
  'role.admin': 'Administrator',
  'role.member': 'Read-only member',
  'role.signedOut': 'Signed out',

  /* ---------------------------------------------------------------- theme */
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'Follow system',
  'theme.toggle': 'Toggle theme',

  'nav.skipToContent': 'Skip to main content',
  'nav.workspace': 'Workspace',
  'nav.workspaceSettings': 'Workspace settings',
  'nav.memberDirectory': 'Member directory',
  'nav.logout': 'Sign out',
  'nav.appearance': 'Appearance: {mode}',
  'nav.back': 'Back',
  'nav.forward': 'Forward',
  'nav.preloadAda': 'Preload Ada details',
  'nav.preloadFailed': 'Preload failed: {reason}',
  'diagnostics.group': 'Diagnostics',

  /* ----------------------------------------------------------------- auth */
  'auth.verifyingSession': 'Verifying your session…',
  'auth.signIn': 'Sign in',
  'auth.signInDescription':
    'Enter your email and password to sign in to your workspace.',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.signingIn': 'Signing in…',
  'auth.firstRunHint': 'For a first local run, set ZEUS_ADMIN_PASSWORD and',

  /* ----------------------------------------------------------------- demo */
  'demo.badge': 'Read-only demo',
  'demo.body':
    'Data is a build-time snapshot of the real API; changes are disabled. Use the Docker deployment for the full console.',

  /* ------------------------------------------------------------- settings */
  'settings.personalLanguage': 'My display language',
  'settings.personalLanguageHint':
    'Only changes what you see. It does not change the workspace default.',
  'settings.workspaceLanguage': 'Workspace default language',
  'settings.workspaceLanguageHint':
    'The starting language for members who have not chosen one. Saving this affects everyone.',

  /* ---------------------------------------------------------- diagnostics */
  'diagnostics.open': 'Open developer diagnostics',
  'diagnostics.close': 'Close developer diagnostics',
  'diagnostics.title': 'Developer diagnostics',
} as const

export type AdminMessageKey = keyof typeof en
