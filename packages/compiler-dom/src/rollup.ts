import type { Plugin } from 'rollup'
import { commonTransform } from './utils'

export function zeusRollupPlugin(): Plugin {
  return {
    name: 'rollup-plugin-zeus',
    transform: commonTransform,
  }
}
