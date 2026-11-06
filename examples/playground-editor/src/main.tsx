import { render } from '@zeus-js/zeus'

import {
  activeFile,
  activePath,
  compile,
  disposePreview,
  files,
  getCompiler,
  loadExample,
  product,
  saveNow,
  selectProduct,
  shareUrl,
  setActiveFilePath,
  setSourceForTest,
  stop,
  testState,
} from './playground/controller'
import { examples } from './playground/examples'
import { PlaygroundShell } from './playground/ui'

import './style.css'

declare global {
  interface Window {
    __zeusPlayground?: {
      getSource(): string
      setSource(value: string): void
      getActivePath(): string
      getFiles(): readonly { path: string; content: string }[]
      selectFile(path: string): void
      selectProduct(product: 'native-lab' | 'webc-studio'): void
      loadExample(id: string): boolean
      run(): Promise<void>
      stop(): Promise<void>
      save(): void
      shareUrl(): Promise<string | undefined>
      getState(): ReturnType<typeof testState>
    }
  }
}

const dispose = render(
  () => <PlaygroundShell />,
  document.querySelector<HTMLElement>('#root')!,
)

window.__zeusPlayground = {
  getSource: () => activeFile().content,
  setSource: value => setSourceForTest(value),
  getActivePath: () => activePath(),
  getFiles: () => files(),
  selectFile: path => setActiveFilePath(path),
  selectProduct: value => selectProduct(value),
  loadExample: id => {
    const example = examples.find(item => item.id === id)
    if (!example) return false
    loadExample(example)
    return true
  },
  run: () => compile(true),
  stop: () => stop(),
  save: saveNow,
  shareUrl: () => shareUrl(),
  getState: () => testState(),
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    dispose()
    disposePreview()
    delete window.__zeusPlayground
  })
}
