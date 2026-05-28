import { describe, expect, it } from 'vitest'

import * as advanced from '../src/advanced'

describe('@zeus-js/zeus/advanced', () => {
  it('exports advanced lifecycle and debugging APIs', () => {
    expect(advanced).toHaveProperty('stop')
    expect(advanced).toHaveProperty('effectScope')
    expect(advanced).toHaveProperty('getCurrentScope')
    expect(advanced).toHaveProperty('onScopeDispose')
    expect(advanced).toHaveProperty('getCurrentEffect')
    expect(advanced).toHaveProperty('onEffectCleanup')
    expect(advanced).toHaveProperty('pauseTracking')
    expect(advanced).toHaveProperty('enableTracking')
    expect(advanced).toHaveProperty('resetTracking')
    expect(advanced).toHaveProperty('getCurrentWatcher')
    expect(advanced).toHaveProperty('onWatcherCleanup')
    expect(advanced).toHaveProperty('isValueState')
    expect(advanced).toHaveProperty('queueJob')
    expect(advanced).toHaveProperty('flushJobs')
    expect(advanced).toHaveProperty('TrackOpTypes')
    expect(advanced).toHaveProperty('TriggerOpTypes')
    expect(advanced).toHaveProperty('ReactiveFlags')
  })

  it('does not export main public APIs', () => {
    expect(advanced).not.toHaveProperty('state')
    expect(advanced).not.toHaveProperty('computed')
    expect(advanced).not.toHaveProperty('effect')
    expect(advanced).not.toHaveProperty('render')
    expect(advanced).not.toHaveProperty('Show')
    expect(advanced).not.toHaveProperty('For')
  })
})
