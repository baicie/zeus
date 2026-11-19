import { describe, expect, it } from 'vitest'

import { App } from './app'

describe('admin template', () => {
  it('exports the application component', () => {
    expect(App).toBeTypeOf('function')
  })
})
