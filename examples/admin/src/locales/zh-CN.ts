/**
 * Simplified Chinese catalog.
 *
 * `satisfies Record<AdminMessageKey, string>` makes a missing key a type
 * error, so the two catalogs cannot drift without the build failing.
 */
import type { AdminMessageKey } from './en'

export const zhCN = {
  /* ---------------------------------------------------------------- common */
  'common.loading': '正在加载…',
  'common.search': '搜索',
  'common.save': '保存',
  'common.cancel': '取消',
  'common.delete': '删除',
  'common.edit': '编辑',
  'common.close': '关闭',
  'common.retry': '重试',
  'common.back': '返回',
  'common.confirm': '确认',
  'common.path': '路径',
  'common.match': '匹配',

  /* ------------------------------------------------------------ navigation */
  'nav.main': '主导航',
  'nav.open': '打开导航',
  'nav.close': '关闭导航',
  'nav.expandSidebar': '展开侧边栏',
  'nav.collapseSidebar': '收起侧边栏',
  'nav.accountMenu': '账户菜单',
  'nav.breadcrumb': '面包屑',
  'nav.pageNavigation': '页面导航',
  'nav.searchPages': '搜索页面',
  'nav.searchPlaceholder': '搜索页面…',
  'nav.noMatch': '没有匹配的页面。',
  'nav.preloading': '预加载中…',
  'nav.notPreloaded': '尚未预加载',

  /* --------------------------------------------------------------- groups */
  'nav.group.general': '常规',
  'nav.group.administration': '管理',
  'nav.group.workspace': '工作空间',

  /* ----------------------------------------------------------------- pages */
  'nav.overview': '概览',
  'nav.users': '用户管理',
  'nav.roles': '角色权限',
  'nav.audit': '审计日志',
  'nav.reports': '管理报表',
  'nav.upload': '文件上传',
  'nav.settings': '设置',
  'nav.pages': '页面',
  'nav.users.short': '用户',
  'nav.reports.short': '报表',

  /* ---------------------------------------------------------------- roles */
  'role.admin': '管理员',
  'role.member': '只读成员',
  'role.signedOut': '未登录',

  /* ---------------------------------------------------------------- theme */
  'theme.light': '浅色',
  'theme.dark': '深色',
  'theme.system': '跟随系统',
  'theme.toggle': '切换主题',

  'nav.skipToContent': '跳到主内容',
  'nav.workspace': '工作空间',
  'nav.workspaceSettings': '工作空间设置',
  'nav.memberDirectory': '成员目录',
  'nav.logout': '退出登录',
  'nav.appearance': '外观模式：{mode}',
  'nav.back': '后退',
  'nav.forward': '前进',
  'nav.preloadAda': '预加载 Ada 详情',
  'nav.preloadFailed': '预加载失败：{reason}',
  'diagnostics.group': '诊断',

  /* ----------------------------------------------------------------- auth */
  'auth.verifyingSession': '正在验证会话…',
  'auth.signIn': '登录',
  'auth.signInDescription': '在下方输入邮箱与密码以登录你的工作空间。',
  'auth.email': '邮箱',
  'auth.password': '密码',
  'auth.signingIn': '登录中…',
  'auth.firstRunHint': '本地首次运行请设置 ZEUS_ADMIN_PASSWORD 与',

  /* ----------------------------------------------------------------- demo */
  'demo.badge': '只读演示',
  'demo.body':
    '数据为构建时的真实 API 快照，修改类操作已禁用。完整功能见 Docker 部署版本。',

  /* ------------------------------------------------------------- settings */
  'settings.personalLanguage': '我的显示语言',
  'settings.personalLanguageHint':
    '只影响你自己的界面，不会改动工作区默认语言。',
  'settings.workspaceLanguage': '工作区默认语言',
  'settings.workspaceLanguageHint':
    '未做选择的成员会以这个语言开始。保存会影响所有成员。',

  /* ------------------------------------------------------------- overview */
  'overview.title': '概览',
  'overview.description':
    '工作空间的成员、团队与审计摘要，数据由服务端会话校验后返回。',
  'overview.viewReports': '查看报表',
  'overview.tabOverview': '概览',
  'overview.tabMembers': '成员',
  'overview.viewLabel': '概览视图',
  'overview.totalMembers': '团队成员',
  'overview.totalMembersHint': '当前工作空间内的全部成员',
  'overview.totalTeams': '团队总数',
  'overview.totalTeamsHint': '成员所属的不同团队',
  'overview.activeMembers': '活跃成员',
  'overview.activeMembersHint': '状态为 active 的成员',
  'overview.auditEvents': '审计事件',
  'overview.pendingInvites': '待邀请',
  'overview.auditEventsHint': '服务端记录的登录与写操作',
  'overview.pendingInvitesHint': '尚未激活的邀请',
  'overview.teamDistribution': '团队分布',
  'overview.teamDistributionHint': '按成员数排序，数据来自成员目录。',
  'overview.noTeamData': '暂无团队数据',
  'overview.teamChartLabel': '团队成员按团队分布',
  'overview.recentMembers': '最新成员',
  'overview.recentMembersHint': '成员目录中按姓名排序的前几位成员。',
  'overview.emptyDirectory': '成员目录为空。',
  'overview.allMembersHint': '全部成员的团队与状态；完整筛选在用户管理页。',
  'overview.colName': '姓名',
  'overview.colEmail': '邮箱',
  'overview.colTeam': '团队',
  'overview.colStatus': '状态',

  /* ---------------------------------------------------------------- users */
  'users.title': '用户列表',
  'users.description': '在这里管理成员以及他们的角色。',
  'users.viewDetails': '查看详情',
  'users.loadFailed': '体验加载失败',
  'users.addMember': '添加成员',
  'users.searchLabel': '搜索用户',
  'users.searchPlaceholder': '搜索成员…',
  'users.filterLabel': '按状态筛选',
  'users.statusFilter': '状态',
  'users.statusActive': '活跃',
  'users.statusInvited': '待邀请',
  'users.statusSuspended': '已暂停',
  'users.reset': '重置',
  'users.loading': '加载中…',
  'users.selected': '已选择：{name}',
  'users.memberCount': '{count} 位成员',
  'users.directoryUnavailable': '无法加载成员目录',

  'users.membersLabel': '工作空间成员',
  'users.colName': '姓名',
  'users.colEmail': '邮箱',
  'users.colTeam': '团队',
  'users.colStatus': '状态',
  'users.pageOf': '第 {page} / {count} 页',
  'users.prevPage': '上一页',
  'users.nextPage': '下一页',
  'users.goToPage': '第 {number} 页',
  'users.deleteMember': '删除成员',
  'users.deleteTitle': '删除成员？',
  'users.deleteBody':
    '将删除 {name}（{email}）。该操作会写入审计日志，且无法撤销。',
  'users.deleteConfirm': '删除',
  'users.inviteHint': '新成员以 invited 状态创建，密码由服务端生成占位哈希。',
  'users.role': '角色',
  'users.roleViewer': '只读成员',
  'users.roleAdmin': '管理员',
  'users.creating': '创建中…',
  'users.createMember': '创建成员',
  'users.backToList': '返回用户列表',
  'users.editMember': '编辑成员',
  'users.loadingDetails': '加载详情中…',
  'users.profile': '成员资料',
  'users.profileHint': '数据来自 route loader，与列表共享同一份查询缓存。',
  'users.saving': '保存中…',
  'users.saved': '已保存',
  'users.saveFailed': '保存失败',
  'users.userId': '用户 ID',
  'users.editHint':
    '更新资料后保存。详情缓存先乐观更新，失败时回滚，列表查询随后失效。',

  /* -------------------------------------------------------------- reports */
  'reports.title': '管理报表',
  'reports.description':
    '汇总当前工作空间的成员与团队规模。数据由服务端在通过角色校验后返回。',
  'reports.totalMembers': '成员总数',
  'reports.acrossTeams': '跨全部团队',
  'reports.totalTeams': '团队总数',
  'reports.establishedTeams': '已建立的团队',
  'reports.auditEvents': '审计事件',
  'reports.serverRecorded': '服务端记录的操作',
  'reports.teamDistribution': '团队分布',
  'reports.teamDistributionHint': '按成员数排序。',
  'reports.teamChartLabel': '团队成员按团队分布',
  'reports.backToOverview': '回到概览',

  /* ---------------------------------------------------------------- audit */
  'audit.title': '审计日志',
  'audit.description':
    '登录、越权尝试与写操作由服务端记录在 SQLite 中，并非浏览器内存。',
  'audit.refresh': '刷新',
  'audit.unavailable': '无法加载审计日志',
  'audit.colTime': '时间',
  'audit.colAction': '操作',
  'audit.colTarget': '对象',
  'audit.colOutcome': '结果',
  'audit.empty': '暂无审计记录',
  'audit.emptyHint': '一旦发生登录、写操作或越权尝试，记录会出现在这里。',
  'audit.total': '共 {count} 条',

  /* ---------------------------------------------------------------- roles */
  'roles.title': '角色与权限',
  'roles.description':
    '浏览器的角色只用于界面呈现。每次读写都由服务端 session 重新校验。',
  'roles.capabilities': '能力',
  'roles.adminDescription': '管理成员、角色、设置与审计记录。',
  'roles.adminCapabilities': '用户 CRUD、角色变更、审计读取、上传、设置写入',
  'roles.viewerDescription': '只读访问用户、报表与设置。',
  'roles.viewerCapabilities': '用户读取、报表读取、设置读取',

  /* ------------------------------------------------------------- settings */
  'settings.title': '设置',
  'settings.description':
    '管理工作空间的名称、语言与主题；保存后写入服务端 SQLite。',
  'settings.sectionWorkspace': '工作空间',
  'settings.sectionAppearance': '外观',
  'settings.sectionUpload': '上传',
  'settings.workspaceName': '工作空间名称',
  'settings.workspaceNameHint': '显示在侧栏与登录页的名称，最长 80 个字符。',
  'settings.theme': '主题',
  'settings.themeLight': '浅色',
  'settings.themeDark': '深色',
  'settings.themeHint': '保存后写入服务端，刷新或重启后仍然保留。',
  'settings.allMembers': '这些设置对所有成员生效。',
  'settings.saved': '设置已保存',
  'settings.saveSettings': '保存设置',

  /* --------------------------------------------------------------- upload */
  'upload.title': '文件上传',
  'upload.description':
    '仅接受文本、Markdown、JSON 与 PNG，上限 64 KiB。服务端拒绝路径分隔符与隐藏文件名。',
  'upload.chooseFile': '选择文件',
  'upload.chooseFileHint': '上传后服务端会返回文件摘要与 SHA-256。',
  'upload.file': '文件',
  'upload.success': '上传成功',
  'upload.size': '大小',
  'upload.uploading': '上传中…',
  'upload.submit': '上传',
  'upload.noFile': '请选择文件。',

  /* ---------------------------------------------------------------- error */
  'error.loadFailed': '页面加载失败',
  'error.loadFailedHint': '加载出现异常，请返回用户列表重试。',
  'error.forbidden': '没有访问权限',
  'error.notFound': '页面不存在',
  'error.serverError': '服务端出现错误',

  /* --------------------------------------------------------------- status */
  'status.active': '活跃',
  'status.invited': '待邀请',
  'status.suspended': '已暂停',
  'status.unknown': '未知',

  /* ---------------------------------------------------------- diagnostics */
  'diagnostics.open': '打开开发诊断',
  'diagnostics.close': '关闭开发诊断',
  'diagnostics.title': '开发诊断',
} satisfies Record<AdminMessageKey, string>
