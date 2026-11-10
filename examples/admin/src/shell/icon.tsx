/**
 * Inline SVG icon set.
 *
 * A small, hand-picked set in one visual language: 24×24 viewBox, 1.5px
 * stroke, round caps, round joins, no fills. Vector geometry is declared as
 * data and turned into real elements, so nothing is injected as markup and the
 * icons inherit `currentColor`.
 *
 * Each entry is a list of SVG primitives. `d` entries are paths; the rest are
 * circles, which keeps the data declarative instead of stringly-typed HTML.
 */

interface IconPath {
  readonly tag: 'path'
  readonly d: string
}
interface IconCircle {
  readonly tag: 'circle'
  readonly cx: number
  readonly cy: number
  readonly r: number
}
interface IconRect {
  readonly tag: 'rect'
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rx: number
}

type IconPrimitive = IconPath | IconCircle | IconRect

const path = (d: string): IconPath => ({ tag: 'path', d })
const circle = (cx: number, cy: number, r: number): IconCircle => ({
  tag: 'circle',
  cx,
  cy,
  r,
})
const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  rx = 0,
): IconRect => ({ tag: 'rect', x, y, width, height, rx })

const ICONS = {
  overview: [
    rect(3, 3, 7, 7, 1.5),
    rect(14, 3, 7, 7, 1.5),
    rect(3, 14, 7, 7, 1.5),
    rect(14, 14, 7, 7, 1.5),
  ],
  users: [
    path('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'),
    circle(9, 7, 4),
    path('M22 21v-2a4 4 0 0 0-3-3.87'),
    path('M16 3.13a4 4 0 0 1 0 7.75'),
  ],
  shield: [
    path('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'),
    path('m9 12 2 2 4-4'),
  ],
  chart: [path('M3 3v18h18'), path('m7 14 3-3 3 3 5-6')],
  list: [
    path('M8 6h13'),
    path('M8 12h13'),
    path('M8 18h13'),
    path('M3 6h.01'),
    path('M3 12h.01'),
    path('M3 18h.01'),
  ],
  upload: [
    path('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'),
    path('m17 8-5-5-5 5'),
    path('M12 3v12'),
  ],
  settings: [
    circle(12, 12, 3),
    path(
      'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    ),
  ],
  menu: [path('M3 12h18'), path('M3 6h18'), path('M3 18h18')],
  sun: [
    circle(12, 12, 4),
    path('M12 2v2'),
    path('M12 20v2'),
    path('m4.93 4.93 1.41 1.41'),
    path('m17.66 17.66 1.41 1.41'),
    path('M2 12h2'),
    path('M20 12h2'),
    path('m6.34 17.66-1.41 1.41'),
    path('m19.07 4.93-1.41 1.41'),
  ],
  moon: [path('M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z')],
  theme: [circle(12, 12, 9), path('M12 3v18'), path('M12 12a9 9 0 0 1 0-9z')],
  logout: [
    path('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'),
    path('m16 17 5-5-5-5'),
    path('M21 12H9'),
  ],
  'chevrons-left': [path('m11 17-5-5 5-5'), path('m18 17-5-5 5-5')],
  'chevrons-right': [path('m13 17 5-5-5-5'), path('m6 17 5-5-5-5')],
  'chevron-up': [path('m18 15-6-6-6 6')],
  'chevron-down': [path('m6 9 6 6 6-6')],
  search: [circle(11, 11, 7), path('m21 21-4.3-4.3')],
  terminal: [path('m4 17 6-6-6-6'), path('M12 19h8')],
  check: [path('m20 6-11 11-5-5')],
  alert: [circle(12, 12, 9), path('M12 8v4'), path('M12 16h.01')],
  inbox: [
    path('M22 12h-6l-2 3h-4l-2-3H2'),
    path(
      'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    ),
  ],
  refresh: [path('M21 12a9 9 0 1 1-2.64-6.36'), path('M21 3v6h-6')],
  mail: [rect(2, 4, 20, 16, 2), path('m2 7 10 6 10-6')],
  team: [
    path('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'),
    circle(9, 7, 4),
    path('M23 21v-2a4 4 0 0 0-3-3.87'),
  ],
  clock: [circle(12, 12, 9), path('M12 7v5l3 2')],
  arrowLeft: [path('M19 12H5'), path('m12 19-7-7 7-7')],
  arrowRight: [path('M5 12h14'), path('m12 5 7 7-7 7')],
  edit: [
    path('M12 20h9'),
    path('M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'),
  ],
  file: [
    path('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'),
    path('M14 2v6h6'),
  ],
  key: [
    circle(7.5, 15.5, 4.5),
    path('m10.5 12.5 8-8'),
    path('m16 5 3 3'),
    path('m18.5 2.5 3 3'),
  ],
  copy: [
    rect(9, 9, 12, 12, 2),
    path('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'),
  ],
  chat: [
    path(
      'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
    ),
  ],
  plus: [path('M12 5v14'), path('M5 12h14')],
  trash: [
    path('M3 6h18'),
    path('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'),
    path('M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'),
  ],
} as const satisfies Record<string, readonly IconPrimitive[]>

export type IconName = keyof typeof ICONS

/**
 * Renders an icon. Decorative by default — every control that uses one also
 * carries a text label or an `aria-label` — so it is hidden from assistive
 * technology unless `label` is given.
 */
export function Icon(props: {
  name: IconName
  class?: string
  label?: string
}) {
  const glyphs = ICONS[props.name]
  return (
    <svg
      class={props.class ? `icon ${props.class}` : 'icon'}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={props.label ? undefined : 'true'}
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
    >
      {glyphs.map(glyph =>
        glyph.tag === 'path' ? (
          <path d={glyph.d} />
        ) : glyph.tag === 'circle' ? (
          <circle cx={glyph.cx} cy={glyph.cy} r={glyph.r} />
        ) : (
          <rect
            x={glyph.x}
            y={glyph.y}
            width={glyph.width}
            height={glyph.height}
            rx={glyph.rx}
          />
        ),
      )}
    </svg>
  )
}
