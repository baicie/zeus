import { createDOMCompiler } from '../babel-plugin'

describe('Zeus JSX Compiler', () => {
  test('should be defined', () => {
    expect(createDOMCompiler).toBeDefined()
  })
})
