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

  /* ---------------------------------------------------------- diagnostics */
  'diagnostics.open': '打开开发诊断',
  'diagnostics.close': '关闭开发诊断',
  'diagnostics.title': '开发诊断',
} satisfies Record<AdminMessageKey, string>
