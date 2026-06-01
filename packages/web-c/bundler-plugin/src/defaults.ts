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

export function resolveComponentInclude(include?: string[]): string[] {
  return include?.length ? include : DEFAULT_COMPONENT_INCLUDE
}

export function resolveComponentExclude(exclude?: string[]): string[] {
  return exclude?.length ? exclude : DEFAULT_COMPONENT_EXCLUDE
}
