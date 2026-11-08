import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { rollbackDeployment } from '../deployment-transaction'
import {
  parseWorkspaceArchiveEntries,
  recoverInterruptedWorkspaceRestore,
  restoreWorkspaceArchive,
  type WorkspaceRestoreHooks,
} from '../deployment-workspace-restore'

import type { DeploymentLayout } from '../deployment-layout'
import type {
  BackupSummary,
  RollbackSummary,
  TransactionOptions,
} from '../deployment-transaction'

vi.setConfig({ testTimeout: 180_000 })

const TEST_IMAGE =
  process.env.ZEUS_WORKSPACE_RESTORE_TEST_IMAGE ?? 'zeus-playground:stage1'
const dockerReady =
  spawnSync('docker', ['image', 'inspect', TEST_IMAGE], {
    encoding: 'utf8',
  }).status === 0
const pythonReady =
  spawnSync('python3', ['--version'], { encoding: 'utf8' }).status === 0

if (!dockerReady) {
  console.warn(
    `[deployment-recovery] skipping Docker fault-injection tests: image ${TEST_IMAGE} is not available`,
  )
}
if (!pythonReady) {
  console.warn(
    '[deployment-recovery] skipping malicious-archive tests: python3 is not available',
  )
}

const recoveryTests = dockerReady && pythonReady ? describe : describe.skip

interface ArchiveFile {
  type: 'file'
  name: string
  content: string
}

interface ArchiveDirectory {
  type: 'dir'
  name: string
  mode?: number
}

interface ArchiveRandom {
  type: 'random'
  name: string
  size: number
}

interface ArchiveSymlink {
  type: 'symlink'
  name: string
  target: string
}

interface ArchiveHardlink {
  type: 'hardlink'
  name: string
  target: string
}

type ArchiveEntry =
  | ArchiveFile
  | ArchiveDirectory
  | ArchiveRandom
  | ArchiveSymlink
  | ArchiveHardlink

interface Fixture {
  readonly root: string
  readonly dataDir: string
  readonly backupDir: string
  readonly archiveFile: string
  readonly oldDigest: string
}

const temporaryRoots: string[] = []
let toolsDir = ''
let pythonScript = ''

function temporary(name: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `zeus-r51-${name}-`))
  temporaryRoots.push(directory)
  return directory
}

function createFixture(name: string): Fixture {
  const root = temporary(name)
  const dataDir = path.join(root, 'data')
  const backupDir = path.join(root, 'backup')
  fs.mkdirSync(path.join(dataDir, 'workspace', 'nested'), {
    recursive: true,
  })
  fs.mkdirSync(backupDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'workspace', 'keep.txt'), 'old data\n')
  fs.writeFileSync(
    path.join(dataDir, 'workspace', 'nested', 'state.bin'),
    randomBytes(256),
  )
  return {
    root,
    dataDir,
    backupDir,
    archiveFile: path.join(backupDir, 'ai-workspace.tgz'),
    oldDigest: treeDigest(path.join(dataDir, 'workspace')),
  }
}

function treeDigest(directory: string): string {
  const hash = createHash('sha256')
  const walk = (relative: string): void => {
    const absolute = relative ? path.join(directory, relative) : directory
    const entries = fs
      .readdirSync(absolute, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : 1))
    for (const entry of entries) {
      const child = relative
        ? path.posix.join(relative, entry.name)
        : entry.name
      const file = path.join(directory, child)
      if (entry.isSymbolicLink()) {
        hash.update(`l\0${child}\0${fs.readlinkSync(file)}\0`)
      } else if (entry.isDirectory()) {
        hash.update(`d\0${child}\0`)
        walk(child)
      } else if (entry.isFile()) {
        const content = createHash('sha256')
          .update(fs.readFileSync(file))
          .digest('hex')
        hash.update(`f\0${child}\0${content}\0`)
      } else {
        hash.update(`o\0${child}\0`)
      }
    }
  }
  walk('')
  return hash.digest('hex')
}

function sha256(file: string): string {
  return `sha256:${createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex')}`
}

function createArchive(file: string, entries: readonly ArchiveEntry[]): number {
  const specFile = path.join(
    toolsDir,
    `spec-${process.pid}-${randomBytes(4).toString('hex')}.json`,
  )
  fs.writeFileSync(specFile, JSON.stringify({ entries }))
  const result = spawnSync('python3', ['-I', pythonScript, specFile, file], {
    encoding: 'utf8',
  })
  fs.rmSync(specFile, { force: true })
  if (result.status !== 0) {
    throw new Error(
      `failed to create the test archive: ${result.stderr || result.stdout}`,
    )
  }
  return entries.length
}

function restore(
  fixture: Fixture,
  entries: number,
  hooks?: WorkspaceRestoreHooks,
): ReturnType<typeof restoreWorkspaceArchive> {
  return restoreWorkspaceArchive({
    archive: {
      file: fixture.archiveFile,
      sha256: sha256(fixture.archiveFile),
      entries,
    },
    dataDir: fixture.dataDir,
    image: TEST_IMAGE,
    ...(hooks ? { hooks } : {}),
  })
}

function activeDigest(fixture: Fixture): string | undefined {
  const workspace = path.join(fixture.dataDir, 'workspace')
  return fs.existsSync(workspace) ? treeDigest(workspace) : undefined
}

function expectFailure(action: () => void): Error {
  let failure: unknown
  try {
    action()
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(Error)
  return failure as Error
}

function previousPath(fixture: Fixture): string {
  return path.join(fixture.dataDir, '.zeus-workspace-previous')
}

function statePath(fixture: Fixture): string {
  return path.join(fixture.dataDir, '.zeus-workspace-restore.state')
}

function candidatePath(fixture: Fixture): string {
  return path.join(fixture.dataDir, '.zeus-workspace-restore')
}

function statePhase(fixture: Fixture): string | undefined {
  const file = statePath(fixture)
  if (!fs.existsSync(file)) return undefined
  const match = /^phase=(.+)$/m.exec(fs.readFileSync(file, 'utf8'))
  return match?.[1]
}

function fakeBinDirectory(
  fixture: Fixture,
  name: string,
  script: string,
): string {
  const directory = path.join(fixture.root, `fake-${name}`)
  fs.mkdirSync(directory, { recursive: true })
  const file = path.join(directory, name)
  fs.writeFileSync(file, script)
  fs.chmodSync(file, 0o755)
  return directory
}

function simpleWorkspace(): ArchiveEntry[] {
  return [
    { type: 'dir', name: 'workspace' },
    { type: 'dir', name: 'workspace/src' },
    {
      type: 'file',
      name: 'workspace/src/main.ts',
      content: 'export const answer = 42\n',
    },
    { type: 'file', name: 'workspace/readme.md', content: 'new data\n' },
    { type: 'symlink', name: 'workspace/link', target: 'src/main.ts' },
  ]
}

function childExit(child: ReturnType<typeof spawn>): Promise<{
  code: number | null
  signal: NodeJS.Signals | null
}> {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('timed out waiting for the workspace restore phase')
}

beforeAll(() => {
  toolsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-r51-tools-'))
  pythonScript = path.join(toolsDir, 'create-archive.py')
  const moduleUrl = new URL(
    '../deployment-workspace-restore.ts',
    import.meta.url,
  ).href
  fs.writeFileSync(
    path.join(toolsDir, 'run-restore.ts'),
    [
      `import { restoreWorkspaceArchive } from ${JSON.stringify(moduleUrl)}`,
      'const input = JSON.parse(process.argv[2])',
      'restoreWorkspaceArchive(input)',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    pythonScript,
    [
      'import io',
      'import json',
      'import os',
      'import sys',
      'import tarfile',
      '',
      "spec = json.load(open(sys.argv[1], 'r', encoding='utf-8'))",
      "with tarfile.open(sys.argv[2], 'w:gz', format=tarfile.GNU_FORMAT, compresslevel=1) as archive:",
      "    for item in spec['entries']:",
      "        info = tarfile.TarInfo(item['name'])",
      '        info.uid = 0',
      '        info.gid = 0',
      "        info.uname = 'root'",
      "        info.gname = 'root'",
      '        info.mtime = 0',
      "        kind = item['type']",
      "        if kind == 'dir':",
      '            info.type = tarfile.DIRTYPE',
      "            info.mode = item.get('mode', 0o755)",
      '            archive.addfile(info)',
      "        elif kind == 'file':",
      "            data = item.get('content', '').encode('utf-8')",
      '            info.type = tarfile.REGTYPE',
      "            info.mode = item.get('mode', 0o644)",
      '            info.size = len(data)',
      '            archive.addfile(info, io.BytesIO(data))',
      "        elif kind == 'random':",
      "            data = os.urandom(item['size'])",
      '            info.type = tarfile.REGTYPE',
      "            info.mode = item.get('mode', 0o644)",
      '            info.size = len(data)',
      '            archive.addfile(info, io.BytesIO(data))',
      "        elif kind == 'symlink':",
      '            info.type = tarfile.SYMTYPE',
      '            info.mode = 0o777',
      "            info.linkname = item['target']",
      '            archive.addfile(info)',
      "        elif kind == 'hardlink':",
      '            info.type = tarfile.LNKTYPE',
      "            info.mode = item.get('mode', 0o644)",
      "            info.linkname = item['target']",
      '            archive.addfile(info)',
      '        else:',
      "            raise SystemExit('unknown entry type: ' + kind)",
      '',
    ].join('\n'),
  )
})

afterAll(() => {
  for (const directory of temporaryRoots) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
  if (toolsDir) fs.rmSync(toolsDir, { recursive: true, force: true })
})

recoveryTests('AI workspace restore transaction', () => {
  it('restores a valid archive and removes the previous workspace only after verification', () => {
    const fixture = createFixture('success')
    const entries = createArchive(fixture.archiveFile, [
      ...simpleWorkspace(),
      {
        type: 'hardlink',
        name: 'workspace/hard-link',
        target: 'workspace/readme.md',
      },
    ])

    const result = restore(fixture, entries)

    expect(result.entries).toBe(entries)
    expect(result.warnings).toEqual([])
    expect(activeDigest(fixture)).not.toBe(fixture.oldDigest)
    expect(
      fs.readFileSync(
        path.join(fixture.dataDir, 'workspace', 'src', 'main.ts'),
        'utf8',
      ),
    ).toContain('answer = 42')
    expect(
      fs.readFileSync(
        path.join(fixture.dataDir, 'workspace', 'hard-link'),
        'utf8',
      ),
    ).toBe('new data\n')
    expect(
      fs.readlinkSync(path.join(fixture.dataDir, 'workspace', 'link')),
    ).toBe('src/main.ts')
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
    expect(fs.existsSync(statePath(fixture))).toBe(false)
    expect(fs.existsSync(candidatePath(fixture))).toBe(false)
  })

  it('refuses a truncated archive even when its checksum matches', () => {
    const fixture = createFixture('corrupt')
    const entries = createArchive(fixture.archiveFile, simpleWorkspace())
    const content = fs.readFileSync(fixture.archiveFile)
    fs.writeFileSync(
      fixture.archiveFile,
      content.subarray(0, Math.floor(content.length / 2)),
    )

    const failure = expectFailure(() => restore(fixture, entries))

    expect(failure.message).toMatch(/cannot be listed/i)
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
  })

  it('rejects a checksum mismatch before touching the active workspace', () => {
    const fixture = createFixture('sha')
    const entries = createArchive(fixture.archiveFile, simpleWorkspace())
    const failure = expectFailure(() =>
      restoreWorkspaceArchive({
        archive: {
          file: fixture.archiveFile,
          sha256: `sha256:${'0'.repeat(64)}`,
          entries,
        },
        dataDir: fixture.dataDir,
        image: TEST_IMAGE,
      }),
    )

    expect(failure.message).toMatch(/checksum mismatch/i)
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
  })

  it('rejects absolute paths and parent-directory traversal entries', () => {
    const fixture = createFixture('traversal')
    const cases: Array<{ entries: ArchiveEntry[]; message: RegExp }> = [
      {
        entries: [
          { type: 'dir', name: 'workspace' },
          { type: 'file', name: '../evil', content: 'escaped\n' },
        ],
        message: /outside the workspace root/i,
      },
      {
        entries: [
          { type: 'dir', name: 'workspace' },
          {
            type: 'file',
            name: 'workspace/../../evil',
            content: 'escaped\n',
          },
        ],
        message: /unsafe path|outside the workspace root/i,
      },
      {
        entries: [
          { type: 'dir', name: 'workspace' },
          {
            type: 'file',
            name: '/tmp/zeus-workspace-escape',
            content: 'escaped\n',
          },
        ],
        message: /absolute path|outside the workspace root/i,
      },
    ]

    for (const testCase of cases) {
      const entries = createArchive(fixture.archiveFile, testCase.entries)
      const failure = expectFailure(() => restore(fixture, entries))
      expect(failure.message).toMatch(testCase.message)
      expect(activeDigest(fixture)).toBe(fixture.oldDigest)
      expect(fs.existsSync(previousPath(fixture))).toBe(false)
      expect(fs.existsSync(path.join(fixture.root, 'evil'))).toBe(false)
      expect(fs.existsSync(path.join(fixture.dataDir, 'evil'))).toBe(false)
      expect(fs.existsSync('/tmp/zeus-workspace-escape')).toBe(false)
    }
  })

  it('rejects absolute and relative symlink escapes before extraction', () => {
    const fixture = createFixture('symlink')
    const cases: ArchiveEntry[][] = [
      [
        { type: 'dir', name: 'workspace' },
        { type: 'symlink', name: 'workspace/abs', target: '/etc/passwd' },
      ],
      [
        { type: 'dir', name: 'workspace' },
        { type: 'symlink', name: 'workspace/dir', target: '../../outside' },
      ],
      [
        { type: 'dir', name: 'workspace' },
        { type: 'symlink', name: 'workspace/first', target: 'second' },
        { type: 'symlink', name: 'workspace/second', target: '../../outside' },
      ],
    ]

    for (const entries of cases) {
      const archiveEntries = createArchive(fixture.archiveFile, entries)
      const failure = expectFailure(() => restore(fixture, archiveEntries))
      expect(failure.message).toMatch(/symlink escapes the workspace root/i)
      expect(activeDigest(fixture)).toBe(fixture.oldDigest)
      expect(fs.existsSync(previousPath(fixture))).toBe(false)
    }
  })

  it('rejects entries that would be written through a symlinked directory', () => {
    const fixture = createFixture('symlink-parent')
    const entries = createArchive(fixture.archiveFile, [
      { type: 'dir', name: 'workspace' },
      { type: 'symlink', name: 'workspace/dir', target: 'safe' },
      { type: 'dir', name: 'workspace/safe' },
      {
        type: 'file',
        name: 'workspace/dir/passwd',
        content: 'escaped\n',
      },
    ])

    const failure = expectFailure(() => restore(fixture, entries))

    expect(failure.message).toMatch(/symlinked directory/i)
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(
      fs.existsSync(path.join(fixture.dataDir, 'workspace', 'dir', 'passwd')),
    ).toBe(false)
  })

  it('fails cleanly when the data mount is read-only', () => {
    const fixture = createFixture('permission')
    const entries = createArchive(fixture.archiveFile, simpleWorkspace())

    const failure = expectFailure(() =>
      restore(fixture, entries, { dataReadOnly: true }),
    )

    expect(failure.message).toMatch(
      /preparing the AI workspace candidate failed/i,
    )
    expect(failure.message).toMatch(/read-only file system|permission denied/i)
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
  })

  it('keeps the active workspace when chown fails', () => {
    const fixture = createFixture('chown')
    const entries = createArchive(fixture.archiveFile, simpleWorkspace())
    const fake = fakeBinDirectory(
      fixture,
      'chown',
      '#!/bin/sh\necho "injected chown failure" >&2\nexit 1\n',
    )

    const failure = expectFailure(() =>
      restore(fixture, entries, {
        extraVolumes: [`${fake}:/fakebin:ro`],
        pathPrefix: '/fakebin',
      }),
    )

    expect(failure.message).toMatch(/injected chown failure/i)
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
    expect(fs.existsSync(statePath(fixture))).toBe(false)
  })

  it('restores the previous workspace when the switch mv fails', () => {
    const fixture = createFixture('mv')
    const entries = createArchive(fixture.archiveFile, simpleWorkspace())
    const fake = fakeBinDirectory(
      fixture,
      'mv',
      [
        '#!/bin/sh',
        'last=',
        'for arg in "$@"; do last=$arg; done',
        'if [ "$1" = "/data/.zeus-workspace-restore" ] && [ "$last" = "/data/workspace" ]; then',
        '  echo "injected mv failure" >&2',
        '  exit 1',
        'fi',
        'exec /bin/mv "$@"',
        '',
      ].join('\n'),
    )

    const failure = expectFailure(() =>
      restore(fixture, entries, {
        extraVolumes: [`${fake}:/fakebin:ro`],
        pathPrefix: '/fakebin',
      }),
    )

    expect(failure.message).toMatch(/injected mv failure/i)
    expect(failure.message).toMatch(/failed to move the prepared workspace/i)
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
    expect(fs.existsSync(statePath(fixture))).toBe(false)
  })

  it('recovers after a SIGKILL during extraction', () => {
    const fixture = createFixture('crash-extract')
    const entries = createArchive(fixture.archiveFile, simpleWorkspace())

    const failure = expectFailure(() =>
      restore(fixture, entries, { crashAfter: 'extract' }),
    )

    expect(failure.message).toMatch(/abrupt exit|exit 137/i)
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
    expect(fs.existsSync(candidatePath(fixture))).toBe(true)

    const recovery = recoverInterruptedWorkspaceRestore({
      dataDir: fixture.dataDir,
      image: TEST_IMAGE,
    })

    expect(recovery.recovered).toBe(true)
    expect(recovery.action).toBe('discarded-unswitched-candidate')
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(fs.existsSync(candidatePath(fixture))).toBe(false)
  })

  it('restores the previous workspace after a SIGKILL between the two moves', () => {
    const fixture = createFixture('crash-previous')
    const entries = createArchive(fixture.archiveFile, simpleWorkspace())

    const failure = expectFailure(() =>
      restore(fixture, entries, { crashAfter: 'previous-moved' }),
    )

    expect(failure.message).toMatch(/abrupt exit|exit 137/i)
    expect(fs.existsSync(path.join(fixture.dataDir, 'workspace'))).toBe(false)
    expect(treeDigest(previousPath(fixture))).toBe(fixture.oldDigest)
    expect(statePhase(fixture)).toBe('previous-moved')
    expect(fs.existsSync(candidatePath(fixture))).toBe(true)

    const retried = restore(fixture, entries)

    expect(retried.recovery.restoredPrevious).toBe(true)
    expect(
      fs.readFileSync(
        path.join(fixture.dataDir, 'workspace', 'readme.md'),
        'utf8',
      ),
    ).toBe('new data\n')
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
    expect(fs.existsSync(statePath(fixture))).toBe(false)
    expect(fs.existsSync(candidatePath(fixture))).toBe(false)
  })

  it('keeps the switched workspace after a SIGKILL and discards the stale previous copy', () => {
    const fixture = createFixture('crash-switched')
    const entries = createArchive(fixture.archiveFile, simpleWorkspace())

    const failure = expectFailure(() =>
      restore(fixture, entries, { crashAfter: 'switched' }),
    )

    expect(failure.message).toMatch(/abrupt exit|exit 137/i)
    const switchedDigest = activeDigest(fixture)
    expect(switchedDigest).not.toBe(fixture.oldDigest)
    expect(treeDigest(previousPath(fixture))).toBe(fixture.oldDigest)
    expect(statePhase(fixture)).toBe('switched')

    const recovery = recoverInterruptedWorkspaceRestore({
      dataDir: fixture.dataDir,
      image: TEST_IMAGE,
    })

    expect(recovery.recovered).toBe(true)
    expect(recovery.removedPrevious).toBe(true)
    expect(activeDigest(fixture)).toBe(switchedDigest)
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
    expect(fs.existsSync(statePath(fixture))).toBe(false)
  })

  it('rolls back to the previous workspace when post-switch verification fails', () => {
    const fixture = createFixture('verification')
    const entries = createArchive(fixture.archiveFile, simpleWorkspace())

    const failure = expectFailure(() =>
      restore(fixture, entries, { corruptAfterSwitch: true }),
    )

    expect(failure.message).toMatch(/failed content verification/i)
    expect(failure.message).toMatch(/previous workspace was restored/i)
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
    expect(fs.existsSync(statePath(fixture))).toBe(false)
    const failed = fs
      .readdirSync(fixture.dataDir)
      .filter(name => name.startsWith('.zeus-workspace-restore-failed-'))
    expect(failed).toHaveLength(1)
  })

  it('recovers from a real docker kill during the switch', async () => {
    const fixture = createFixture('docker-kill')
    const entries = createArchive(fixture.archiveFile, simpleWorkspace())
    const containerName = `zeus-r51-kill-${process.pid}-${Date.now()}`
    const input = {
      archive: {
        file: fixture.archiveFile,
        sha256: sha256(fixture.archiveFile),
        entries,
      },
      dataDir: fixture.dataDir,
      image: TEST_IMAGE,
      hooks: {
        pauseAfter: 'previous-moved',
        containerName,
      },
    }
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        path.join(toolsDir, 'run-restore.ts'),
        JSON.stringify(input),
      ],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const exited = childExit(child)
    let childError = ''
    child.stderr?.on('data', chunk => {
      childError += String(chunk)
    })
    try {
      await waitFor(() => statePhase(fixture) === 'previous-moved')
      expect(fs.existsSync(path.join(fixture.dataDir, 'workspace'))).toBe(false)
      expect(treeDigest(previousPath(fixture))).toBe(fixture.oldDigest)

      const killed = spawnSync('docker', ['kill', containerName], {
        encoding: 'utf8',
      })
      expect(killed.status, killed.stderr).toBe(0)
      const exit = await exited
      expect(exit.code, childError).not.toBe(0)

      const retried = restore(fixture, entries)
      expect(retried.recovery.restoredPrevious).toBe(true)
      expect(
        fs.readFileSync(
          path.join(fixture.dataDir, 'workspace', 'readme.md'),
          'utf8',
        ),
      ).toBe('new data\n')
      expect(fs.existsSync(previousPath(fixture))).toBe(false)
      expect(fs.existsSync(statePath(fixture))).toBe(false)
    } finally {
      spawnSync('docker', ['kill', containerName], { encoding: 'utf8' })
      child.kill('SIGKILL')
    }
  })

  // Docker Desktop does not enforce `--storage-opt size` on overlayfs and
  // virtiofs cannot reliably bind-mount a DMG-backed volume, so a literal
  // ENOSPC is not portable here. `ulimit -f` produces the same real write
  // failure (EFBIG/SIGXFSZ) inside the extraction container and exercises the
  // identical transaction path: old workspace active, no switch, clear error.
  it('fails cleanly when extraction hits a file-size capacity limit', () => {
    const fixture = createFixture('disk-full')
    const entries = createArchive(fixture.archiveFile, [
      { type: 'dir', name: 'workspace' },
      { type: 'random', name: 'workspace/large.bin', size: 2 * 1024 * 1024 },
    ])

    const failure = expectFailure(() =>
      restore(fixture, entries, { extractFileLimitBlocks: 1024 }),
    )

    expect(failure.message).toMatch(
      /file size|too large|SIGXFSZ|short write|write error|preparing the AI workspace candidate failed/i,
    )
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(fs.existsSync(previousPath(fixture))).toBe(false)
    expect(fs.existsSync(statePath(fixture))).toBe(false)

    const recovery = recoverInterruptedWorkspaceRestore({
      dataDir: fixture.dataDir,
      image: TEST_IMAGE,
    })
    expect(recovery.recovered).toBe(true)
    expect(activeDigest(fixture)).toBe(fixture.oldDigest)
    expect(fs.existsSync(candidatePath(fixture))).toBe(false)
  })
})

describe('workspace archive entry validation', () => {
  const verboseDir = (name: string) =>
    `drwxr-xr-x root/root 0 2026-01-01 00:00 ${name}`
  const verboseFile = (name: string) =>
    `-rw-r--r-- root/root 1 2026-01-01 00:00 ${name}`
  const verboseLink = (name: string, target: string) =>
    `lrwxrwxrwx root/root 0 2026-01-01 00:00 ${name} -> ${target}`

  it('rejects parent-directory traversal before tar can sanitize it', () => {
    expect(() =>
      parseWorkspaceArchiveEntries(
        'workspace/\nworkspace/../../evil\n',
        `${verboseDir('workspace/')}\n${verboseFile('workspace/../../evil')}\n`,
      ),
    ).toThrow(/unsafe path/i)
  })

  it('rejects absolute entry names', () => {
    expect(() =>
      parseWorkspaceArchiveEntries(
        '/tmp/evil\n',
        `${verboseFile('/tmp/evil')}\n`,
      ),
    ).toThrow(/absolute path/i)
  })

  it('rejects symlink chains that resolve outside the workspace', () => {
    expect(() =>
      parseWorkspaceArchiveEntries(
        'workspace/\nworkspace/first\nworkspace/second\n',
        [
          verboseDir('workspace/'),
          verboseLink('workspace/first', 'second'),
          verboseLink('workspace/second', '../../outside'),
        ].join('\n'),
      ),
    ).toThrow(/symlink escapes the workspace root/i)
  })

  it('rejects entries whose parent is a regular file', () => {
    expect(() =>
      parseWorkspaceArchiveEntries(
        'workspace/\nworkspace/a\nworkspace/a/b\n',
        [
          verboseDir('workspace/'),
          verboseFile('workspace/a'),
          verboseFile('workspace/a/b'),
        ].join('\n'),
      ),
    ).toThrow(/non-directory as a parent/i)
  })

  it('rejects duplicate archive entries', () => {
    expect(() =>
      parseWorkspaceArchiveEntries(
        'workspace/\nworkspace/a\nworkspace/a\n',
        [
          verboseDir('workspace/'),
          verboseFile('workspace/a'),
          verboseFile('workspace/a'),
        ].join('\n'),
      ),
    ).toThrow(/duplicate entry/i)
  })

  it('maps directory, file and symlink entries after stripping the root', () => {
    const parsed = parseWorkspaceArchiveEntries(
      'workspace/\nworkspace/dir/\nworkspace/dir/file\nworkspace/link\n',
      [
        verboseDir('workspace/'),
        verboseDir('workspace/dir/'),
        verboseFile('workspace/dir/file'),
        verboseLink('workspace/link', 'dir/file'),
      ].join('\n'),
    )

    expect(parsed.entryCount).toBe(4)
    expect(parsed.manifest.get('dir')).toEqual({
      path: 'dir',
      type: 'directory',
    })
    expect(parsed.manifest.get('dir/file')).toEqual({
      path: 'dir/file',
      type: 'file',
    })
    expect(parsed.manifest.get('link')).toEqual({
      path: 'link',
      type: 'symlink',
      target: 'dir/file',
    })
  })
})

describe('rollback partial recovery reporting', () => {
  it('reports databases restored, workspace failure and manual intervention', () => {
    const root = temporary('partial')
    const dataDir = path.join(root, 'data')
    const backupDir = path.join(root, 'backup')
    fs.mkdirSync(path.join(dataDir, 'workspace'), { recursive: true })
    fs.mkdirSync(backupDir, { recursive: true })
    const workspaceArchive = path.join(backupDir, 'ai-workspace.tgz')
    fs.writeFileSync(workspaceArchive, 'not used by this test')
    const adminBackup = path.join(backupDir, 'admin.sqlite')
    const aiBackup = path.join(backupDir, 'ai.sqlite')
    fs.writeFileSync(adminBackup, 'admin')
    fs.writeFileSync(aiBackup, 'ai')

    const previous = {
      containers: {
        admin: {
          key: 'admin',
          name: 'zeus-admin-old',
          image: 'zeus-admin:old',
          imageId: 'sha256:old-admin',
          running: true,
          mounts: [],
          env: {},
        },
        aiHost: {
          key: 'aiHost',
          name: 'zeus-ai-old',
          image: 'zeus-ai:old',
          imageId: 'sha256:old-ai',
          running: true,
          mounts: [],
          env: {},
        },
      },
      buildInfos: {
        admin: 'sha256:build-ok',
        'ai-workbench': 'sha256:build-ok',
      },
      renamed: [
        { from: 'zeus-admin-old-r44', to: 'zeus-admin-old' },
        { from: 'zeus-ai-old-r44', to: 'zeus-ai-old' },
      ],
    }
    const layout = {
      schema: 'zeus.deployment-layout/v1',
      environment: 'local',
      allowedHosts: ['127.0.0.1'],
      allowedPorts: ['443'],
      sandboxUrl: 'http://127.0.0.1/sandbox.html',
      products: {
        'webc-studio': '',
        'native-lab': '',
        admin: '',
        'ai-workbench': '',
      },
      containers: {
        playground: 'p',
        admin: 'a',
        aiHost: 'h',
        workbench: 'w',
      },
      ports: {
        playgroundHost: 1,
        playgroundSandbox: 2,
        admin: 3,
        workbench: 4,
      },
      dataDirs: { admin: path.join(root, 'admin'), ai: dataDir },
    } as DeploymentLayout
    const options = {
      images: {
        admin: { image: 'zeus-admin:old' },
        aiHost: { image: 'zeus-ai:old' },
      },
    } as unknown as TransactionOptions
    const backups: BackupSummary = {
      directory: backupDir,
      admin: {
        file: adminBackup,
        sha256: sha256(adminBackup),
        sqliteCheck: 'ok',
      },
      ai: { file: aiBackup, sha256: sha256(aiBackup), sqliteCheck: 'ok' },
      aiWorkspace: {
        file: workspaceArchive,
        sha256: `sha256:${'1'.repeat(64)}`,
        entries: 1,
      },
    }
    const events: string[] = []
    let summary: RollbackSummary | undefined
    let failure: unknown
    try {
      rollbackDeployment(
        previous,
        layout,
        backups,
        options,
        path.join(root, 'runtime.env'),
        {
          composeDown: () => {},
          restoreDatabase: (_file, _dataDir, name) => {
            events.push(`db:${name}`)
          },
          restoreWorkspace: () => {
            events.push('workspace')
            throw new Error(
              'failed to restore the AI workspace: archive checksum mismatch',
            )
          },
          renameContainer: () => true,
          startContainer: () => true,
          waitForHealth: () => true,
          fetchBuildInfo: () => 'sha256:build-ok',
        },
      )
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
    summary = (failure as { rollback: RollbackSummary }).rollback
    expect(events).toEqual(['db:admin.sqlite', 'db:ai.sqlite', 'workspace'])
    expect(summary.restoredDatabases).toEqual([adminBackup, aiBackup])
    expect(summary.restoredWorkspaces).toEqual([])
    expect(summary.workspaceRestored).toBe(false)
    expect(summary.requiresManualIntervention).toBe(true)
    expect(summary.errors.join(' ')).toMatch(/AI workspace/i)
    expect(summary.restoredContainers).toEqual([
      'zeus-ai-old',
      'zeus-admin-old',
    ])
    expect(summary.health).toBe('PASS')
    expect(summary.buildInfoVerified).toBe(true)
    expect((failure as Error).message).toMatch(
      /rollback did not fully restore/i,
    )
  })
})
