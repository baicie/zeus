import type {
  PlaygroundFile,
  PlaygroundProduct,
  PersistedWorkspace,
} from './model'
import { validatePersistedWorkspace } from './persistence'

const SHARE_PREFIX = 'p='
const MAX_ENCODED_LENGTH = 18_000
const MAX_JSON_BYTES = 900_000

export interface SharePayload {
  readonly product: PlaygroundProduct
  readonly files: readonly PlaygroundFile[]
  readonly activePath: string
  readonly exampleId?: string
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof CompressionStream === 'undefined') return undefined
  const stream = new Blob([toArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzipBounded(
  bytes: Uint8Array,
  maxBytes: number,
): Promise<Uint8Array | undefined> {
  const stream = new Blob([toArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return undefined
      }
      chunks.push(value)
    }
  } catch {
    return undefined
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export async function encodeShare(
  payload: SharePayload,
): Promise<string | undefined> {
  const json = JSON.stringify({
    schemaVersion: 1,
    product: payload.product,
    files: payload.files,
    activePath: payload.activePath,
    ...(payload.exampleId ? { exampleId: payload.exampleId } : {}),
  })
  const jsonBytes = new TextEncoder().encode(json)
  if (jsonBytes.byteLength > MAX_JSON_BYTES) return undefined
  const compressed = await gzip(jsonBytes)
  const encoded = compressed
    ? `g.${bytesToBase64Url(compressed)}`
    : `u.${bytesToBase64Url(jsonBytes)}`
  if (encoded.length > MAX_ENCODED_LENGTH) return undefined
  return encoded
}

export async function decodeShare(
  value: string,
): Promise<SharePayload | undefined> {
  if (value.length > MAX_ENCODED_LENGTH) return undefined
  const [kind, data] = value.split('.', 2)
  if ((kind !== 'g' && kind !== 'u') || !data) return undefined
  try {
    const bytes = base64UrlToBytes(data)
    if (kind === 'u' && bytes.byteLength > MAX_JSON_BYTES) return undefined
    const jsonBytes =
      kind === 'g' ? await gunzipBounded(bytes, MAX_JSON_BYTES) : bytes
    if (!jsonBytes || jsonBytes.byteLength > MAX_JSON_BYTES) return undefined
    const parsed = JSON.parse(new TextDecoder().decode(jsonBytes)) as unknown
    if (!parsed || typeof parsed !== 'object') return undefined
    const candidate = {
      ...(parsed as Record<string, unknown>),
      savedAt: new Date(0).toISOString(),
    }
    if (!validatePersistedWorkspace(candidate)) return undefined
    const workspace = candidate as PersistedWorkspace
    return {
      product: workspace.product,
      files: workspace.files,
      activePath: workspace.activePath,
      ...(workspace.exampleId ? { exampleId: workspace.exampleId } : {}),
    }
  } catch {
    return undefined
  }
}

export function shareFromLocation(): string | undefined {
  if (typeof location === 'undefined') return undefined
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : ''
  const params = new URLSearchParams(hash)
  return params.get(SHARE_PREFIX.slice(0, -1)) ?? undefined
}

export async function createShareUrl(
  payload: SharePayload,
): Promise<string | undefined> {
  const encoded = await encodeShare(payload)
  if (!encoded) return undefined
  return `${location.origin}${location.pathname}#${SHARE_PREFIX}${encoded}`
}

export function downloadShareJson(payload: SharePayload): void {
  const json = JSON.stringify(
    {
      schemaVersion: 1,
      ...payload,
      savedAt: new Date().toISOString(),
    },
    null,
    2,
  )
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'zeus-playground-project.json'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function readShareHash(): string | undefined {
  return shareFromLocation()
}

export function clearShareHash(): void {
  if (typeof history === 'undefined') return
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}
