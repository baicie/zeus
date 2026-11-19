// Type-level parity with the Node adapter, checked by the root `pnpm check`.
import type * as Native from '../../compiler-native/index'
import type * as Wasm from '../index'

type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false

export const optionsMatch: MutuallyAssignable<
  Native.TransformModuleOptions,
  Wasm.TransformModuleOptions
> = true
export const resultsMatch: MutuallyAssignable<
  Native.TransformModuleResult,
  Wasm.TransformModuleResult
> = true
