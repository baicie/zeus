// scripts/bench/component-host-config.ts

import path from 'node:path'

export const componentHostBenchConfig = {
  root: path.resolve('benchmarks/component-host'),
  dist: path.resolve('benchmarks/component-host/dist'),
  reportDir: path.resolve('temp/bench/component-host'),

  thresholds: {
    size: {
      'wc/z-bench-button.js:gzip': 256,
      'wc/z-bench-button-shadow.js:gzip': 512,
      'wc/index.js:gzip': 36 * 1024,
      'react/z-bench-button.js:gzip': 24 * 1024,
      'vue/z-bench-button.js:gzip': 28 * 1024,
    },

    compile: {
      'build.wc.ms': 3000,
      'build.wc-shadow.ms': 3000,
      'build.wc-nested.ms': 3000,
      'build.wc-react.ms': 10000,
      'build.wc-vue.ms': 10000,
      'build.all.ms': 12000,
      'analyze.components.ms': 1000,
    },

    runtime: {
      // Light DOM (baseline)
      'wc.mount.1000.ms': 100,
      'wc.propUpdate.1000.ms': 50,
      'wc.attributeUpdate.1000.ms': 80,
      'wc.click.1000.ms': 50,
      // Shadow DOM
      'wc-shadow.mount.1000.ms': 150,
      'wc-shadow.propUpdate.1000.ms': 80,
      'wc-shadow.attributeUpdate.1000.ms': 120,
      'wc-shadow.click.1000.ms': 80,
      // Nested / slot
      'wc-nested.mountNested.100.ms': 200,
      'wc-nested.mountNestedLeaf.500.ms': 150,
      'wc-nested.slotProjection.100.ms': 100,
    },
  },
} as const

export type ComponentHostBenchThresholds =
  typeof componentHostBenchConfig.thresholds
