import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const docsRoot = path.join(root, 'docs')
const guidePath = path.join(docsRoot, 'guide/choosing-zeus.md')
const guide = readFileSync(guidePath, 'utf8')
const requiredHeadings = [
  '# Choose Zeus',
  '## Zeus Native',
  '## Web Components',
  '## React or Vue applications',
  '## When Zeus is not a fit',
  '## Start here',
]

for (const heading of requiredHeadings) {
  if (!guide.split(/\r?\n/).includes(heading)) {
    throw new Error(`Choose Zeus guide is missing the heading: ${heading}`)
  }
}

const localLinks = guide.matchAll(/\]\((\/(?!\/)[^)#]+)(?:#[^)]*)?\)/g)
for (const [, route] of localLinks) {
  const documentPath = path.join(docsRoot, `${route.slice(1)}.md`)
  if (!existsSync(documentPath)) {
    throw new Error(`Choose Zeus guide links to a missing document: ${route}`)
  }
}

console.log('Choose Zeus guide and local links passed.')
