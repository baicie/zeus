import { describe, expect, it } from 'vitest'

import packageJson from '../package.json'
import * as zeus from '../src'

describe('@zeus-js/zeus public API', () => {
  it('exports stable user-facing APIs', () => {
    expect(zeus).toHaveProperty('createSignal')
    expect(zeus).toHaveProperty('createMemo')
    expect(zeus).toHaveProperty('createEffect')
    expect(zeus).toHaveProperty('createRoot')
    expect(zeus).toHaveProperty('batch')
    expect(zeus).toHaveProperty('onCleanup')
    expect(zeus).toHaveProperty('render')
    expect(zeus).toHaveProperty('Show')
    expect(zeus).toHaveProperty('For')
    expect(zeus).toHaveProperty('Host')
    expect(zeus).toHaveProperty('Slot')
    expect(zeus).toHaveProperty('defineElement')
    expect(zeus).toHaveProperty('Fragment')
    expect(zeus).toHaveProperty('jsx')
    expect(zeus).toHaveProperty('jsxs')
    expect(zeus).toHaveProperty('jsxDEV')
  })

  it('does not retain the superseded beta reactivity surface', () => {
    expect(zeus).not.toHaveProperty('state')
    expect(zeus).not.toHaveProperty('computed')
    expect(zeus).not.toHaveProperty('effect')
    expect(zeus).not.toHaveProperty('watch')
    expect(zeus).not.toHaveProperty('scope')
    expect(zeus).not.toHaveProperty('untrack')
    expect(zeus).not.toHaveProperty('nextTick')
  })

  it('does not publish the superseded advanced reactivity entry', () => {
    expect(packageJson.exports).not.toHaveProperty('./advanced')
  })

  it('does not export compiler/runtime internal helpers from main entry', () => {
    expect(zeus).not.toHaveProperty('template')
    expect(zeus).not.toHaveProperty('insert')
    expect(zeus).not.toHaveProperty('marker')
    expect(zeus).not.toHaveProperty('bindText')
    expect(zeus).not.toHaveProperty('bindAttr')
    expect(zeus).not.toHaveProperty('bindProp')
    expect(zeus).not.toHaveProperty('bindClass')
    expect(zeus).not.toHaveProperty('bindStyle')
    expect(zeus).not.toHaveProperty('bindEvent')
    expect(zeus).not.toHaveProperty('mountShow')
    expect(zeus).not.toHaveProperty('mountFor')
  })

  it('does not export advanced lifecycle/debugging APIs from main entry', () => {
    expect(zeus).not.toHaveProperty('stop')
    expect(zeus).not.toHaveProperty('effectScope')
    expect(zeus).not.toHaveProperty('pauseTracking')
    expect(zeus).not.toHaveProperty('enableTracking')
    expect(zeus).not.toHaveProperty('resetTracking')
    expect(zeus).not.toHaveProperty('getCurrentEffect')
    expect(zeus).not.toHaveProperty('onEffectCleanup')
    expect(zeus).not.toHaveProperty('getCurrentScope')
    expect(zeus).not.toHaveProperty('onScopeDispose')
    expect(zeus).not.toHaveProperty('getCurrentWatcher')
    expect(zeus).not.toHaveProperty('onWatcherCleanup')
    expect(zeus).not.toHaveProperty('TrackOpTypes')
    expect(zeus).not.toHaveProperty('TriggerOpTypes')
    expect(zeus).not.toHaveProperty('ReactiveFlags')
  })
})
