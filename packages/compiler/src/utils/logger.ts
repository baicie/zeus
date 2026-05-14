import { createLoggerInstance } from '@baicie/logger'

export const logger = createLoggerInstance({
  prefix: 'zeus-compiler',
})

export function logCompilerError(error: unknown) {
  logger.error(error)
}
