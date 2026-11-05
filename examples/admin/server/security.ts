import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

const KEY_LENGTH = 64

export function hashPassword(
  password: string,
  salt = randomBytes(16).toString('hex'),
): string {
  const derived = scryptSync(password, salt, KEY_LENGTH)
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, digest] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !digest) return false
  const expected = Buffer.from(digest, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}
