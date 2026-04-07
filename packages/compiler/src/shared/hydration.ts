import type * as t from '@babel/types'
import { objectExpression, objectProperty, stringLiteral } from '@babel/types'

export interface HydrationEventMeta {
  name: string
  strategy: 'delegate' | 'native'
}

function normalizeHydrationStrategy(
  strategy: unknown,
  fallback: 'delegate' | 'native',
): 'delegate' | 'native' {
  if (strategy === 'delegate' || strategy === 'native') {
    return strategy
  }
  return fallback
}

export function buildHydrationEventMeta(
  events: string[],
  defaultStrategy: 'delegate' | 'native',
  eventStrategies?: Record<string, 'delegate' | 'native'>,
): HydrationEventMeta[] {
  const out: HydrationEventMeta[] = []
  const normalizedDefault = normalizeHydrationStrategy(
    defaultStrategy,
    'delegate',
  )
  for (let i = 0; i < events.length; i++) {
    const name = events[i]
    const fromMap = eventStrategies ? eventStrategies[name] : undefined
    const strategy = normalizeHydrationStrategy(fromMap, normalizedDefault)
    out.push({
      name,
      strategy,
    })
  }
  return out
}

export function hydrationEventMetaToAst(
  meta: HydrationEventMeta[],
): t.Expression[] {
  const out: t.Expression[] = []
  for (let i = 0; i < meta.length; i++) {
    out.push(
      objectExpression([
        objectProperty(stringLiteral('name'), stringLiteral(meta[i].name)),
        objectProperty(
          stringLiteral('strategy'),
          stringLiteral(meta[i].strategy),
        ),
      ]),
    )
  }
  return out
}
