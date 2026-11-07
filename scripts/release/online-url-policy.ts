/**
 * URL, DNS and redirect policy for online deployment acceptance.
 *
 * Only explicitly approved HTTPS ports are accepted. Every redirect hop is
 * revalidated, DNS answers must be public, and browser traffic can be routed
 * through a CONNECT proxy that pins the validated address.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net, { type LookupFunction } from 'node:net'

import { isPrivateAddress } from './network-policy'

export const APPROVED_ONLINE_PORTS = ['443', '8443'] as const
const MAX_REDIRECTS = 5
const MAX_BODY_BYTES = 8 * 1024 * 1024
const HOP_TIMEOUT_MS = 15_000

export interface ApprovedUrlPolicy {
  readonly allowedHosts: readonly string[]
  readonly allowedPorts: readonly string[]
  /**
   * Optional operator-supplied address pins. Used when local DNS is intercepted
   * (for example by a development VPN) but the real public addresses are known.
   * Every address is still validated as public and TLS still uses the hostname.
   */
  readonly hostAddresses?: Readonly<
    Record<string, readonly { address: string; family: number }[]>
  >
}

export function createHostAddressMap(
  values: readonly string[],
): Record<string, readonly { address: string; family: number }[]> {
  const map: Record<string, readonly { address: string; family: number }[]> = {}
  for (const value of values) {
    for (const item of value.split(',')) {
      const entry = item.trim()
      if (!entry) continue
      const separator = entry.indexOf('=')
      if (separator <= 0) {
        throw new Error('host map entries must be host=address')
      }
      const host = entry.slice(0, separator).trim().toLowerCase()
      const address = entry.slice(separator + 1).trim()
      const family = net.isIP(address)
      if (!host || family === 0) {
        throw new Error(`host map entry ${entry} is not host=IP`)
      }
      if (isPrivateAddress(address)) {
        throw new Error(`host map address for ${host} is not public`)
      }
      map[host] = [{ address, family }]
    }
  }
  return map
}

export interface ApprovedResponse {
  readonly status: number
  readonly headers: http.IncomingHttpHeaders
  readonly contentType: string
  readonly body: string
  readonly bytes: Buffer
  readonly finalUrl: string
  readonly redirects: readonly string[]
}

export interface PinnedProxy {
  readonly server: http.Server
  readonly port: number
  close(): Promise<void>
}

export function normalizeOnlinePort(value: string | undefined): string {
  return value && value.length > 0 ? value : '443'
}

/** Parses `--allow-port` values; anything outside the approved set is fatal. */
export function createApprovedPorts(
  values: readonly string[],
): readonly string[] {
  const ports = new Set<string>()
  for (const value of values.length > 0 ? values : ['443']) {
    for (const item of value.split(',')) {
      const port = item.trim()
      if (!port) continue
      if (
        !/^\d{1,5}$/.test(port) ||
        !(APPROVED_ONLINE_PORTS as readonly string[]).includes(port)
      ) {
        throw new Error(
          `port ${port} is not an approved online HTTPS port (${APPROVED_ONLINE_PORTS.join(', ')})`,
        )
      }
      ports.add(port)
    }
  }
  if (ports.size === 0)
    throw new Error('at least one approved port is required')
  return [...ports]
}

export function assertApprovedHttpsUrl(
  value: string | URL,
  policy: ApprovedUrlPolicy,
): URL {
  let url: URL
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(value)
  } catch {
    throw new Error('online acceptance URL is invalid')
  }
  if (url.username || url.password) {
    throw new Error('online acceptance URL must not contain credentials')
  }
  if (url.protocol !== 'https:') {
    throw new Error('online acceptance requires HTTPS')
  }
  const host = url.hostname.toLowerCase()
  if (net.isIP(host.replace(/^\[|\]$/g, '')) !== 0) {
    throw new Error('online acceptance requires a DNS hostname')
  }
  if (!policy.allowedHosts.includes(host)) {
    throw new Error(`host ${host} is not in the approved host list`)
  }
  if (!policy.allowedPorts.includes(normalizeOnlinePort(url.port))) {
    throw new Error(
      `port ${normalizeOnlinePort(url.port)} is not in the approved port list`,
    )
  }
  return url
}

export async function resolvePublicAddresses(
  hostname: string,
  mapped?: Readonly<
    Record<string, readonly { address: string; family: number }[]>
  >,
): Promise<Array<{ address: string; family: number }>> {
  const host = hostname.replace(/^\[|\]$/g, '')
  const pinned = mapped?.[host]
  if (pinned && pinned.length > 0) {
    for (const entry of pinned) {
      if (isPrivateAddress(entry.address)) {
        throw new Error(`host ${host} is mapped to a private address`)
      }
    }
    return [...pinned]
  }
  const addresses = await dnsLookup(host, { all: true, verbatim: true })
  if (addresses.length === 0) throw new Error(`no DNS address for ${host}`)
  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) {
      throw new Error(`host ${host} resolves to a private address`)
    }
  }
  return addresses
}

export function createPinnedLookup(
  addresses: readonly { address: string; family: number }[],
): LookupFunction {
  return (_hostname, options, callback) => {
    const address = addresses[0]
    if (!address) {
      callback(new Error('no approved address'), '', 0)
      return
    }
    if (
      typeof options === 'object' &&
      options !== null &&
      'all' in options &&
      options.all === true
    ) {
      const done = callback as unknown as (
        error: NodeJS.ErrnoException | null,
        addresses: readonly { address: string; family: number }[],
      ) => void
      done(null, addresses)
      return
    }
    callback(null, address.address, address.family)
  }
}

export async function fetchApproved(
  value: string,
  policy: ApprovedUrlPolicy,
): Promise<ApprovedResponse> {
  let current = assertApprovedHttpsUrl(value, policy)
  const redirects: string[] = []
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const addresses = await resolvePublicAddresses(
      current.hostname,
      policy.hostAddresses,
    )
    const response = await requestApproved(current, addresses)
    if (isRedirect(response.status)) {
      const location = response.headers.location
      if (typeof location !== 'string') {
        throw new Error(`redirect ${response.status} without Location`)
      }
      redirects.push(current.href)
      current = assertApprovedHttpsUrl(new URL(location, current), policy)
      continue
    }
    return { ...response, finalUrl: current.href, redirects }
  }
  throw new Error(`too many redirects (> ${MAX_REDIRECTS})`)
}

/** CONNECT proxy that only reaches approved hosts and public addresses. */
export async function startPinnedProxy(
  policy: ApprovedUrlPolicy,
): Promise<PinnedProxy> {
  const server = http.createServer((_request, response) => {
    response.writeHead(405, { connection: 'close' }).end()
  })
  server.on('connect', (request, clientSocket, head) => {
    void handleConnect(request.url, clientSocket, head, policy)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('pinned proxy did not bind a TCP port')
  }
  return {
    server,
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      ),
  }
}

async function handleConnect(
  target: string | undefined,
  clientSocket: import('node:stream').Duplex,
  head: Buffer,
  policy: ApprovedUrlPolicy,
): Promise<void> {
  try {
    const parsed = parseConnectTarget(target)
    if (!policy.allowedHosts.includes(parsed.hostname)) {
      throw new Error('host is not approved')
    }
    if (!policy.allowedPorts.includes(parsed.port)) {
      throw new Error('port is not approved')
    }
    const addresses = await resolvePublicAddresses(
      parsed.hostname,
      policy.hostAddresses,
    )
    const address = addresses[0]
    if (!address) throw new Error('no address')
    const upstream = net.connect({
      host: address.address,
      port: Number(parsed.port),
    })
    upstream.once('connect', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
    })
    upstream.once('error', () => clientSocket.destroy())
    clientSocket.once('error', () => upstream.destroy())
  } catch {
    clientSocket.end(
      'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
    )
  }
}

function parseConnectTarget(target: string | undefined): {
  hostname: string
  port: string
} {
  if (!target) throw new Error('CONNECT target is missing')
  const separator = target.lastIndexOf(':')
  if (separator <= 0) throw new Error('CONNECT target must include a port')
  const hostname = target.slice(0, separator).toLowerCase()
  const port = normalizeOnlinePort(target.slice(separator + 1))
  if (!/^[a-z0-9.-]+$/.test(hostname)) throw new Error('invalid CONNECT host')
  return { hostname, port }
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status)
}

function requestApproved(
  url: URL,
  addresses: readonly { address: string; family: number }[],
): Promise<Omit<ApprovedResponse, 'finalUrl' | 'redirects'>> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          host: url.host,
          'user-agent': 'zeus-playground-acceptance/1',
          accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        },
        servername: url.hostname,
        lookup: createPinnedLookup(addresses),
        timeout: HOP_TIMEOUT_MS,
      },
      response => {
        const chunks: Buffer[] = []
        let bytes = 0
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.byteLength
          if (bytes > MAX_BODY_BYTES) {
            response.destroy(new Error('response body exceeds 2 MiB'))
            return
          }
          chunks.push(chunk)
        })
        response.on('error', reject)
        response.on('end', () => {
          const body = Buffer.concat(chunks)
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            contentType: String(response.headers['content-type'] ?? ''),
            body: body.toString('utf8'),
            bytes: body,
          })
        })
      },
    )
    request.on('timeout', () =>
      request.destroy(
        new Error(`request timed out after ${HOP_TIMEOUT_MS} ms`),
      ),
    )
    request.on('error', reject)
    request.end()
  })
}
