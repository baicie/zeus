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
  'nav.group.reference': 'Reference',

  /* ----------------------------------------------------------------- pages */
  'gallery.packages': 'Real components rendered on this page',
  'gallery.enterprise': 'Enterprise',
  'gallery.notifications': 'Email notifications',
  'gallery.avatarAlt': 'Member avatar',
  'gallery.dataTable': 'Data table',
  'gallery.nativeBadge': 'Admin markup',
  'gallery.title': 'Component gallery',
  'gallery.description':
    'Every control Admin ships, with its states side by side. The examples are live: click, type and tab through them.',
  'gallery.sections': 'Gallery sections',
  'gallery.actions': 'Actions',
  'gallery.actionsHint':
    'Buttons, dialogs, toasts and menus, including disabled and busy states.',
  'gallery.forms': 'Forms',
  'gallery.formsHint': 'Inputs, selects, choices and validation feedback.',
  'gallery.data': 'Data',
  'gallery.dataHint': 'Status badges, avatars, progress and skeletons.',
  'gallery.navigation': 'Navigation',
  'gallery.navigationHint': 'Tabs, accordions, popovers and tooltips.',
  'gallery.states': 'States',
  'gallery.statesHint':
    'Loading, empty, error, success and disabled, as Admin uses them.',
  'gallery.buttons': 'Buttons',
  'gallery.primary': 'Primary',
  'gallery.secondary': 'Secondary',
  'gallery.ghost': 'Ghost',
  'gallery.destructive': 'Delete',
  'gallery.disabled': 'Disabled',
  'gallery.loading': 'Loading',
  'gallery.dialog': 'Dialog',
  'gallery.openDialog': 'Open dialog',
  'gallery.dialogTitle': 'Delete this member?',
  'gallery.dialogCopy':
    'This example has no side effect; the real delete dialog asks for confirmation the same way.',
  'gallery.confirm': 'Confirm',
  'gallery.toast': 'Toast',
  'gallery.showSuccess': 'Show success',
  'gallery.showError': 'Show failure',
  'gallery.savedToast': 'Saved.',
  'gallery.confirmedToast': 'Confirmed.',
  'gallery.failedToast': 'That action failed.',
  'gallery.dropdown': 'Dropdown menu',
  'gallery.openMenu': 'Open menu',
  'gallery.menuEdit': 'Edit',
  'gallery.menuDuplicate': 'Duplicate',
  'gallery.menuDelete': 'Delete',
  'gallery.textFields': 'Text fields',
  'gallery.name': 'Name',
  'gallery.namePlaceholder': 'Ada Lovelace',
  'gallery.email': 'Email',
  'gallery.invalidEmail': 'Enter a valid email address.',
  'gallery.disabledField': 'Disabled field',
  'gallery.disabledValue': 'Read-only value',
  'gallery.validate': 'Validate',
  'gallery.formValid': 'Looks good.',
  'gallery.textarea': 'Textarea',
  'gallery.textareaPlaceholder': 'Write a note…',
  'gallery.select': 'Select',
  'gallery.selectDisabled': 'Disabled select',
  'gallery.checkboxRadio': 'Checkbox and radio',
  'gallery.agree': 'Send me a digest',
  'gallery.switch': 'Switch',
  'gallery.badges': 'Badges',
  'gallery.outline': 'Outline',
  'gallery.avatars': 'Avatars',
  'gallery.progress': 'Progress',
  'gallery.skeleton': 'Skeleton',
  'gallery.tabs': 'Tabs',
  'gallery.tab.one': 'Overview',
  'gallery.tab.two': 'Activity',
  'gallery.tab.three': 'Settings',
  'gallery.tabPanel.one': 'The first panel.',
  'gallery.tabPanel.two': 'The second panel.',
  'gallery.tabPanel.three': 'The third panel.',
  'gallery.accordion': 'Accordion',
  'gallery.accordion.a': 'What does Admin store?',
  'gallery.accordion.b': 'Who can change roles?',
  'gallery.accordionPanel.a':
    'Workspace settings, users and an audit log, in SQLite by default.',
  'gallery.accordionPanel.b':
    'Administrators only. Viewers can read the same pages but not change them.',
  'gallery.popover': 'Popover',
  'gallery.openPopover': 'Open popover',
  'gallery.popoverTitle': 'Workspace',
  'gallery.popoverCopy':
    'Popovers hold short context that does not deserve a page.',
  'gallery.tooltip': 'Tooltip',
  'gallery.hoverMe': 'Hover me',
  'gallery.tooltipText': 'A tooltip names a control that has no visible label.',
  'gallery.empty': 'Empty',
  'gallery.emptyTitle': 'No members yet',
  'gallery.emptyCopy': 'Invite someone to see rows here.',
  'gallery.error': 'Error',
  'gallery.errorTitle': 'Could not load',
  'gallery.errorCopy': 'The server did not answer. Retry from the toolbar.',
  'gallery.success': 'Success',
  'gallery.successTitle': 'Saved',
  'gallery.successCopy': 'Changes are visible on the next request.',
  'gallery.loadingCopy': 'Fetching members…',
  'common.dismiss': 'Dismiss',
  'nav.overview': 'Overview',
  'nav.users': 'Users',
  'nav.roles': 'Roles & permissions',
  'nav.audit': 'Audit log',
  'nav.reports': 'Reports',
  'nav.upload': 'File upload',
  'nav.settings': 'Settings',
  'nav.components': 'Components',
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

  /* ------------------------------------------------------------- overview */
  'overview.title': 'Overview',
  'overview.description':
    'Members, teams and audit activity for this workspace, returned by the server after the session is verified.',
  'overview.viewReports': 'View reports',
  'overview.tabOverview': 'Overview',
  'overview.tabMembers': 'Members',
  'overview.viewLabel': 'Overview view',
  'overview.totalMembers': 'Team members',
  'overview.totalMembersHint': 'Everyone in this workspace',
  'overview.totalTeams': 'Teams',
  'overview.totalTeamsHint': 'Distinct teams members belong to',
  'overview.activeMembers': 'Active members',
  'overview.activeMembersHint': 'Members with status active',
  'overview.auditEvents': 'Audit events',
  'overview.pendingInvites': 'Pending invites',
  'overview.auditEventsHint': 'Sign-ins and writes recorded by the server',
  'overview.pendingInvitesHint': 'Invitations not yet accepted',
  'overview.teamDistribution': 'Team distribution',
  'overview.teamDistributionHint':
    'Sorted by member count, from the member directory.',
  'overview.noTeamData': 'No team data yet',
  'overview.teamChartLabel': 'Members by team',
  'overview.recentMembers': 'Recent members',
  'overview.recentMembersHint':
    'First few members from the directory, sorted by name.',
  'overview.emptyDirectory': 'The member directory is empty.',
  'overview.allMembersHint':
    'Team and status for every member; full filtering lives in Users.',
  'overview.colName': 'Name',
  'overview.colEmail': 'Email',
  'overview.colTeam': 'Team',
  'overview.colStatus': 'Status',

  /* ---------------------------------------------------------------- users */
  'users.title': 'User list',
  'users.description': 'Manage members and their roles here.',
  'users.viewDetails': 'View details',
  'users.loadFailed': 'Failed to load this view',
  'users.addMember': 'Add member',
  'users.searchLabel': 'Search users',
  'users.searchPlaceholder': 'Search members…',
  'users.filterLabel': 'Filter by status',
  'users.statusFilter': 'Status',
  'users.statusActive': 'Active',
  'users.statusInvited': 'Invited',
  'users.statusSuspended': 'Suspended',
  'users.reset': 'Reset',
  'users.loading': 'Loading…',
  'users.selected': 'Selected: {name}',
  'users.memberCount': '{count, plural, one {# member} other {# members}}',
  'users.directoryUnavailable': 'Could not load the member directory',

  'users.membersLabel': 'Workspace members',
  'users.colName': 'Name',
  'users.colEmail': 'Email',
  'users.colTeam': 'Team',
  'users.colStatus': 'Status',
  'users.pageOf': 'Page {page} of {count}',
  'users.prevPage': 'Previous page',
  'users.nextPage': 'Next page',
  'users.goToPage': 'Page {number}',
  'users.deleteMember': 'Delete member',
  'users.deleteTitle': 'Delete member?',
  'users.deleteBody':
    'Deletes {name} ({email}). This writes to the audit log and cannot be undone.',
  'users.deleteConfirm': 'Delete',
  'users.inviteHint':
    'New members are created with status invited; the server generates a placeholder password hash.',
  'users.role': 'Role',
  'users.roleViewer': 'Read-only member',
  'users.roleAdmin': 'Administrator',
  'users.creating': 'Creating…',
  'users.createMember': 'Create member',
  'users.backToList': 'Back to user list',
  'users.editMember': 'Edit member',
  'users.loadingDetails': 'Loading details…',
  'users.profile': 'Member profile',
  'users.profileHint':
    'Data comes from the route loader and shares the list query cache.',
  'users.saving': 'Saving…',
  'users.saved': 'Saved',
  'users.saveFailed': 'Save failed',
  'users.userId': 'User ID',
  'users.editHint':
    'Saves after updating. The detail cache updates optimistically, rolls back on failure, and the list query is invalidated afterwards.',

  /* -------------------------------------------------------------- reports */
  'reports.title': 'Reports',
  'reports.description':
    'Member and team totals for this workspace, returned by the server after the role check.',
  'reports.totalMembers': 'Total members',
  'reports.acrossTeams': 'Across all teams',
  'reports.totalTeams': 'Teams',
  'reports.establishedTeams': 'Teams created',
  'reports.auditEvents': 'Audit events',
  'reports.serverRecorded': 'Operations recorded by the server',
  'reports.teamDistribution': 'Team distribution',
  'reports.teamDistributionHint': 'Sorted by member count.',
  'reports.teamChartLabel': 'Members by team',
  'reports.backToOverview': 'Back to overview',

  /* ---------------------------------------------------------------- audit */
  'audit.title': 'Audit log',
  'audit.description':
    'Sign-ins, authorization failures and writes are recorded by the server in SQLite, not in browser memory.',
  'audit.refresh': 'Refresh',
  'audit.unavailable': 'Could not load the audit log',
  'audit.colTime': 'Time',
  'audit.colAction': 'Action',
  'audit.colTarget': 'Target',
  'audit.colOutcome': 'Outcome',
  'audit.empty': 'No audit records yet',
  'audit.emptyHint':
    'Records appear here once a sign-in, write or authorization failure happens.',
  'audit.total': '{count} records',

  /* ---------------------------------------------------------------- roles */
  'roles.title': 'Roles & permissions',
  'roles.description':
    'The browser role only shapes the interface. Every read and write is re-checked by the server session.',
  'roles.capabilities': 'Capabilities',
  'roles.matrixTitle': 'Capability matrix',
  'roles.matrixHint':
    'Read a row to answer whether a role is allowed to do it.',
  'roles.capability': 'Capability',
  'roles.allowed': 'Allowed',
  'roles.denied': 'Not allowed',
  'roles.noMembers': 'No members yet.',
  'roles.assignTitle': 'Assign a role',
  'roles.assignHint': 'Changes take effect on the member’s next request.',
  'roles.adminOnly': 'Only an administrator can change roles.',
  'roles.member': 'Member',
  'roles.pickMember': 'Pick a member',
  'roles.role': 'Role',
  'roles.assign': 'Assign',
  'roles.assigning': 'Assigning…',
  'roles.assigned': '{name} is now {role}.',
  'roles.capability.users.read': 'Read members',
  'roles.capability.users.write': 'Create and edit members',
  'roles.capability.users.delete': 'Delete members',
  'roles.capability.reports.read': 'Read reports',
  'roles.capability.audit.read': 'Read the audit log',
  'roles.capability.settings.read': 'Read workspace settings',
  'roles.capability.settings.write': 'Change workspace settings',
  'roles.capability.uploads.write': 'Upload files',
  'roles.adminDescription':
    'Manage members, roles, settings and audit records.',
  'roles.adminCapabilities':
    'User CRUD, role changes, audit reads, uploads, settings writes',
  'roles.viewerDescription': 'Read-only access to users, reports and settings.',
  'roles.viewerCapabilities': 'User reads, report reads, settings reads',

  /* ------------------------------------------------------------- settings */
  'settings.title': 'Settings',
  'settings.description':
    'Manage the workspace name, language and theme; saving writes to the server SQLite.',
  'settings.sectionWorkspace': 'Workspace',
  'settings.sectionAppearance': 'Appearance',
  'settings.sectionUpload': 'Upload',
  'settings.workspaceName': 'Workspace name',
  'settings.workspaceNameHint':
    'Shown in the sidebar and on the sign-in page, up to 80 characters.',
  'settings.theme': 'Theme',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.themeHint':
    'Saved to the server, so it survives a refresh or restart.',
  'settings.saveSettings': 'Save settings',
  'settings.allMembers': 'These settings apply to every member.',
  'settings.saved': 'Settings saved',

  /* --------------------------------------------------------------- upload */
  'upload.title': 'File upload',
  'upload.description':
    'Text, Markdown, JSON and PNG only, up to 64 KiB. The server rejects path separators and hidden filenames.',
  'upload.chooseFile': 'Choose a file',
  'upload.chooseFileHint':
    'The server returns the file digest and SHA-256 after upload.',
  'upload.file': 'File',
  'upload.success': 'Upload succeeded',
  'upload.size': 'Size',
  'upload.uploading': 'Uploading…',
  'upload.submit': 'Upload',
  'upload.noFile': 'Please choose a file.',

  /* ---------------------------------------------------------------- error */
  'error.loadFailed': 'Page failed to load',
  'error.loadFailedHint':
    'Something went wrong while loading. Go back to the user list and retry.',
  'error.forbidden': 'No access',
  'error.notFound': 'Page not found',
  'error.serverError': 'Server error',

  /* --------------------------------------------------------------- status */
  'status.active': 'Active',
  'status.invited': 'Invited',
  'status.suspended': 'Suspended',
  'status.unknown': 'Unknown',

  /* ---------------------------------------------------------- diagnostics */
  'diagnostics.open': 'Open developer diagnostics',
  'diagnostics.close': 'Close developer diagnostics',
  'diagnostics.title': 'Developer diagnostics',
} as const

export type AdminMessageKey = keyof typeof en
