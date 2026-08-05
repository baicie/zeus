import { describe, expect, it } from 'vitest'

import * as server from '../src/server'

describe('@zeus-js/zeus/server public API', () => {
  it('exports only server rendering and stable reactivity APIs', () => {
    expect(Object.keys(server).sort()).toEqual([
      'For',
      'Show',
      'batch',
      'createEffect',
      'createMemo',
      'createRoot',
      'createSignal',
      'onCleanup',
      'renderToString',
    ])
  })
})
