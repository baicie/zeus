// Worker side of `createWorkerCompiler`. Start it as a module Worker, for
// example `new Worker(new URL('@zeus-js/compiler-wasm/worker', import.meta.url), { type: 'module' })`.
import { loadCompiler } from './index.js'

let compiler

self.addEventListener('message', async ({ data }) => {
  if (data.type === 'init') {
    compiler = loadCompiler(data.module)
    return
  }
  if (data.type !== 'transform') return

  try {
    const result = await (await compiler).transformModule(data.options)
    self.postMessage({ id: data.id, result })
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: { name: error.name, message: error.message },
    })
  }
})
