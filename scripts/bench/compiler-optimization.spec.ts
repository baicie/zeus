import {
  assertCompilerOptimizationBudget,
  compilerOptimizationBudget,
  type CompilerOptimizationReport,
} from './compiler-optimization'

const baseline: CompilerOptimizationReport = {
  generatedBytes: 1463,
  templateFactories: 2,
  staticTemplateConsumers: 2,
  staticTemplateFactories: 1,
  bindingCalls: 3,
  reactiveEffects: 2,
  onceBindings: 1,
  eventBindingCalls: 1,
  delegatedEventSetupCalls: 1,
  diagnostics: 0,
}

describe('compiler optimization budget', () => {
  it('accepts the checked-in compiler fixture baseline', () => {
    expect(() => assertCompilerOptimizationBudget(baseline)).not.toThrow()
  })

  it('rejects duplicated static templates and excess effect setup', () => {
    expect(() =>
      assertCompilerOptimizationBudget({
        ...baseline,
        staticTemplateFactories:
          compilerOptimizationBudget.staticTemplateFactories + 1,
        reactiveEffects: compilerOptimizationBudget.reactiveEffects + 1,
      }),
    ).toThrow(/static template factories 2 != 1; reactive effects 3 != 2/)
  })

  it('rejects per-node event listeners when delegation grows', () => {
    expect(() =>
      assertCompilerOptimizationBudget({
        ...baseline,
        eventBindingCalls: compilerOptimizationBudget.eventBindingCalls + 1,
        delegatedEventSetupCalls:
          compilerOptimizationBudget.delegatedEventSetupCalls + 1,
      }),
    ).toThrow(/event binding calls 2 != 1; delegated event setup calls 2 != 1/)
  })

  it('rejects missing binding setup instead of treating zero as an improvement', () => {
    expect(() =>
      assertCompilerOptimizationBudget({
        ...baseline,
        reactiveEffects: 0,
        eventBindingCalls: 0,
        delegatedEventSetupCalls: 0,
      }),
    ).toThrow(
      /reactive effects 0 != 2; event binding calls 0 != 1; delegated event setup calls 0 != 1/,
    )
  })
})
