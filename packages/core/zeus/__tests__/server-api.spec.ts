import { describe, expect, it } from 'vitest'

import * as server from '../src/server'

describe('@zeus-js/zeus/server public API', () => {
  it('exports only server rendering and stable reactivity APIs', () => {
    expect(Object.keys(server).sort()).toEqual([
      'For',
      'Host',
      'Portal',
      'SSR_STREAMING_API_VERSION',
      'Show',
      'Slot',
      'Transition',
      'batch',
      'createContext',
      'createEffect',
      'createMemo',
      'createRoot',
      'createSignal',
      'defineElement',
      'event',
      'inject',
      'onCleanup',
      'prop',
      'provide',
      'renderToStream',
      'renderToString',
      'serializeSSRNodeChunks',
      'ssrComponentFromManifest',
      'ssrCustomElement',
      'ssrHydrationMarker',
      'useContext',
    ])
  })
})
