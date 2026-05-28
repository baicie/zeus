import { describe, expect, it } from 'vitest'

import * as internal from '../src/internal'

describe('@zeus-js/zeus/internal', () => {
  it('exports runtime helpers', () => {
    expect(internal).toHaveProperty('template')
    expect(internal).toHaveProperty('insert')
    expect(internal).toHaveProperty('mountDynamic')
    expect(internal).toHaveProperty('child')
    expect(internal).toHaveProperty('marker')
    expect(internal).toHaveProperty('removeNodes')
    expect(internal).toHaveProperty('bindText')
    expect(internal).toHaveProperty('bindTextContent')
    expect(internal).toHaveProperty('bindAttr')
    expect(internal).toHaveProperty('bindProp')
    expect(internal).toHaveProperty('bindClass')
    expect(internal).toHaveProperty('bindStyle')
    expect(internal).toHaveProperty('bindEvent')
    expect(internal).toHaveProperty('delegateEvents')
    expect(internal).toHaveProperty('bindRef')
    expect(internal).toHaveProperty('setRef')
    expect(internal).toHaveProperty('createComponent')
    expect(internal).toHaveProperty('mountShow')
    expect(internal).toHaveProperty('mountFor')
    expect(internal).toHaveProperty('createSlot')
    expect(internal).toHaveProperty('getCurrentHostContext')
    expect(internal).toHaveProperty('withHostContext')
    expect(internal).toHaveProperty('captureCurrentHostContext')
    expect(internal).toHaveProperty('withCapturedHostContext')
  })
})
