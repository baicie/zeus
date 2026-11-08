// Standalone mock npm registry used by the dist-tag rehearsal.
// It runs in its own process so that the synchronous `npm view` calls in the
// test worker cannot block the HTTP server's event loop. State is fixed per
// process, which keeps every rehearsal case fully isolated.
import { createServer } from 'node:http'

const initial = JSON.parse(process.argv[2] ?? '{}')
const state = new Map(Object.entries(initial))
const hits = new Map()

function packument(name, pkg) {
  const versions = pkg.versions ?? (pkg.latest ? [pkg.latest] : [])
  return {
    name,
    'dist-tags': pkg.latest ? { latest: pkg.latest } : {},
    versions: Object.fromEntries(
      versions.map(version => [
        version,
        {
          name,
          version,
          dist: { tarball: `http://127.0.0.1/${name}/-/${version}.tgz` },
        },
      ]),
    ),
  }
}

const server = createServer((request, response) => {
  response.on('error', () => {})
  request.on('error', () => {})
  try {
    if (request.method === 'GET' && request.url === '/__hits') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(Object.fromEntries(hits)))
      return
    }
    const path = decodeURIComponent(request.url ?? '/')
    const name = path.replace(/^\//, '')
    const count = (hits.get(name) ?? 0) + 1
    hits.set(name, count)
    const pkg = state.get(name)
    if (!pkg) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'Not found' }))
      return
    }
    if (pkg.failuresBeforeSuccess && count <= pkg.failuresBeforeSuccess) {
      response.writeHead(503, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'temporarily unavailable' }))
      return
    }
    if (pkg.status && pkg.status >= 400) {
      response.writeHead(pkg.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'mock failure' }))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(packument(name, pkg)))
  } catch {
    try {
      response.destroy()
    } catch {}
  }
})
server.on('clientError', (_error, socket) => {
  try {
    socket.destroy()
  } catch {}
})

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT ${server.address().port}\n`)
})
