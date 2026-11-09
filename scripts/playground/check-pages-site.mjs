#!/usr/bin/env node
/**
 * Guards the GitHub Pages bundle before it is published.
 *
 * Two things break a Pages deploy silently: a page that references assets
 * outside its base path (Pages 404s them), and a sandbox page missing its
 * module graph. Both halves must also load from the same base, because the
 * sandbox is embedded from a URL the host resolves.
 */
import fs from 'node:fs'
import path from 'node:path'

const directory = process.argv[2]
const expectedBase = process.argv[3]
if (!directory || !expectedBase) {
  console.error('usage: check-pages-site.mjs <dir> </base/assets/>')
  process.exit(2)
}

const failures = []
for (const file of ['index.html', 'sandbox.html', 'webc.html']) {
  const full = path.join(directory, file)
  if (!fs.existsSync(full)) {
    failures.push(`${file} is missing`)
    continue
  }
  const html = fs.readFileSync(full, 'utf8')
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(
    match => match[1],
  )
  const assets = refs.filter(ref => /\.(js|css)$/.test(ref))
  if (assets.length === 0) failures.push(`${file} references no assets`)
  const escaping = assets.filter(
    ref => ref.startsWith('/') && !ref.startsWith(expectedBase),
  )
  if (escaping.length > 0) {
    failures.push(
      `${file} references assets outside ${expectedBase}: ${escaping.join(', ')}`,
    )
  }
}

for (const asset of ['build-info.json', '.nojekyll']) {
  if (!fs.existsSync(path.join(directory, asset))) {
    failures.push(`${asset} is missing`)
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`::error::${failure}`)
  process.exit(1)
}
console.log(
  `pages bundle ok: ${expectedBase} assets on index/sandbox/webc, build-info and .nojekyll present`,
)
