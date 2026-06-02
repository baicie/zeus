export const icons = {
  check: {
    viewBox: '0 0 24 24',
    render: () => (
      <path
        d="M20 6 9 17l-5-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    ),
  },

  x: {
    viewBox: '0 0 24 24',
    render: () => [
      <path
        d="M18 6 6 18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />,
      <path
        d="m6 6 12 12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />,
    ],
  },
} as const

export type IconName = keyof typeof icons
