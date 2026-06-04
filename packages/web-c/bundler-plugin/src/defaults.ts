export const DEFAULT_COMPONENT_INCLUDE = [
  'src/**/*.{ts,tsx,js,jsx}',
  'components/**/*.{ts,tsx,js,jsx}',
]

export const DEFAULT_COMPONENT_EXCLUDE = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  '**/*.d.ts',
  'src/shared/**',
  'node_modules/**',
  'dist/**',
]

export const DEFAULT_TRANSFORM_INCLUDE = DEFAULT_COMPONENT_INCLUDE

export const DEFAULT_TRANSFORM_EXCLUDE = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  '**/*.d.ts',
  'node_modules/**',
  'dist/**',
]

export function resolveComponentInclude(include?: string[]): string[] {
  return include?.length ? include : DEFAULT_COMPONENT_INCLUDE
}

export function resolveComponentExclude(exclude?: string[]): string[] {
  return exclude?.length ? exclude : DEFAULT_COMPONENT_EXCLUDE
}

export function resolveTransformInclude(
  include: string[] | undefined,
  componentInclude: string[],
): string[] {
  if (include?.length) return include

  return Array.from(
    new Set([...DEFAULT_TRANSFORM_INCLUDE, ...componentInclude]),
  )
}

export function resolveTransformExclude(exclude?: string[]): string[] {
  return exclude?.length ? exclude : DEFAULT_TRANSFORM_EXCLUDE
}
