/**
 * Comment markers that let a Light DOM custom element separate server-rendered
 * internal structure from consumer children after upgrade.
 *
 * The server writes them and the client upgrade path consumes them; neither
 * side guesses structure from arbitrary HTML. Without these markers the client
 * treats every existing child as an unknown consumer child (fresh mount).
 *
 * Format (comments, so they never affect rendered text):
 *   <!--zeus:light:root-->   ... internal content ...   <!--/zeus:light:root-->
 *   <!--zeus:light:child-->  ... one projected consumer node ...  <!--/zeus:light:child-->
 */
export const LIGHT_DOM_ROOT_MARKER = 'zeus:light:root'
export const LIGHT_DOM_ROOT_END_MARKER = '/zeus:light:root'
export const LIGHT_DOM_CHILD_MARKER = 'zeus:light:child'
export const LIGHT_DOM_CHILD_END_MARKER = '/zeus:light:child'
