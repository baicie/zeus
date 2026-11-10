/**
 * Session context.
 *
 * Pages need the current role for presentation only — which shortcuts to show,
 * which nav groups exist. Authorization is *never* decided here: every read and
 * write is re-checked by the server against the session cookie, and the route
 * loaders repeat the role check so a hand-typed URL still gets a 403.
 *
 * Exposing it through context keeps `pages.tsx` free of prop drilling while
 * leaving the router's loader-level checks as the real gate.
 */

import { createContext, useContext } from '@zeus-js/zeus'

import type { Role } from './routes'

export interface SessionContextValue {
  /** Current role as the server reported it at sign-in. */
  readonly role: Role
}

export const SessionContext = createContext<SessionContextValue>({
  role: 'viewer',
})

/** Reads the session context; defaults to the least-privileged role. */
export function useSession(): SessionContextValue {
  return useContext(SessionContext)
}
