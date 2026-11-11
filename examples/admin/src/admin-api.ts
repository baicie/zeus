/**
 * Chooses the Admin API implementation for this build.
 *
 * Production builds talk to the real server (`examples/admin/server`). The
 * published demo (`VITE_ZEUS_ADMIN_DEMO=true`) is hosted on GitHub Pages, which
 * cannot run that server, so it reads a snapshot the server itself produced at
 * build time — see `scripts/release/admin-demo-snapshot.ts` and `demo-api.ts`.
 *
 * The choice is a build-time constant, so the HTTP client is dropped from the
 * demo bundle entirely by dead-code elimination, and the snapshot loader never
 * ships to production.
 */
import { createHttpAdminApi } from './api'
import type { AdminHttpApi } from './api'
import { createStaticAdminApi, isAdminDemoSnapshot } from './demo-api'

/** True in the read-only Pages build; the UI uses it to explain itself. */
export const isDemoBuild: boolean =
  import.meta.env.VITE_ZEUS_ADMIN_DEMO === 'true'

/** Where the demo's snapshot sits next to the app (respects Vite's base). */
const DEMO_SNAPSHOT_URL = `${import.meta.env.BASE_URL}demo-snapshot.json`

let resolved: AdminHttpApi | undefined

async function resolveApi(): Promise<AdminHttpApi> {
  if (resolved) return resolved
  if (!isDemoBuild) {
    resolved = createHttpAdminApi(import.meta.env.VITE_ZEUS_ADMIN_API ?? '')
    return resolved
  }
  const response = await fetch(DEMO_SNAPSHOT_URL, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(
      `无法加载演示快照（${response.status}）：${DEMO_SNAPSHOT_URL}。请运行 scripts/release/admin-demo-snapshot.ts 重新生成。`,
    )
  }
  const snapshot: unknown = await response.json()
  if (!isAdminDemoSnapshot(snapshot)) {
    throw new Error('演示快照格式不正确（期望 zeus.admin-demo/v1）。')
  }
  resolved = createStaticAdminApi(snapshot)
  return resolved
}

/**
 * Every method awaits the implementation once, then delegates. Call sites never
 * see the difference, and the demo's snapshot load happens exactly once.
 */
export const adminApi: AdminHttpApi = {
  login: (email, password) =>
    resolveApi().then(api => api.login(email, password)),
  session: signal => resolveApi().then(api => api.session(signal)),
  logout: signal => resolveApi().then(api => api.logout(signal)),
  getSummary: signal => resolveApi().then(api => api.getSummary(signal)),
  listUsers: (query, signal) =>
    resolveApi().then(api => api.listUsers(query, signal)),
  getUser: (id, signal) => resolveApi().then(api => api.getUser(id, signal)),
  updateUser: (id, patch, signal) =>
    resolveApi().then(api => api.updateUser(id, patch, signal)),
  createUser: (input, signal) =>
    resolveApi().then(api => api.createUser(input, signal)),
  deleteUser: (id, signal) =>
    resolveApi().then(api => api.deleteUser(id, signal)),
  listAudit: (page, pageSize, signal) =>
    resolveApi().then(api => api.listAudit(page, pageSize, signal)),
  getSettings: signal => resolveApi().then(api => api.getSettings(signal)),
  updateSettings: (settings, signal) =>
    resolveApi().then(api => api.updateSettings(settings, signal)),
  uploadFile: (file, signal) =>
    resolveApi().then(api => api.uploadFile(file, signal)),
}
