// Type-level test — verifies public API types are correctly exported.
// If TypeScript can parse this file without errors, the types are exported correctly.

import { describe, it, expect } from 'vitest'

import {
  For,
  Host,
  Show,
  Slot,
  computed,
  defineElement,
  effect,
  render,
  scope,
  state,
  watch,
  batch,
  untrack,
  nextTick,
  onCleanup,
} from '../src'

describe('@zeus-js/zeus public API types', () => {
  it('exports all runtime values from main entry', () => {
    const _exports = {
      For,
      Host,
      Show,
      Slot,
      computed,
      defineElement,
      effect,
      render,
      scope,
      state,
      watch,
      batch,
      untrack,
      nextTick,
      onCleanup,
    }
    expect(_exports.state).toBeDefined()
    expect(_exports.For).toBeDefined()
  })
})
