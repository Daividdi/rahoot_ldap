import { createConnection } from 'net'

const LDAP_URL   = process.env.LDAP_URL   || ''
const LDAP_DOMAIN = process.env.LDAP_DOMAIN || ''
const LDAP_SEARCH_BASE = process.env.LDAP_SEARCH_BASE || ''
const LDAP_SVC_USER = process.env.LDAP_SERVICE_USER || ''
const LDAP_SVC_PASS = process.env.LDAP_SERVICE_PASS || ''

// Active Directory does not accept a simple bind with a bare account name. The
// user bind already sends `user@domain`; a service account configured as just
// "svcuser" gets the same treatment. UPN, DN and DOMAIN\user values pass through.
function serviceBindName(): string {
  const u = LDAP_SVC_USER.trim()
  if (!u || !LDAP_DOMAIN || u.includes('@') || u.includes('=') || u.includes('\\')) return u
  return `${u}@${LDAP_DOMAIN}`
}

// ── Minimal async LDAP client ─────────────────────────────────────────────
// We only need BindRequest + SearchRequest, so we implement them inline
// rather than pulling in a full LDAP library (avoids ESM/CJS bundling edge cases).

function parseHost(url: string): { host: string; port: number } {
  const m = url.replace(/^ldaps?:\/\//, '').match(/^([^:]+)(?::(\d+))?$/)
  return { host: m?.[1] ?? '', port: Number(m?.[2] ?? 389) }
}

// BER/ASN.1 helpers ──────────────────────────────────────────────────────────
function berLen(n: number): Buffer {
  if (n < 128) return Buffer.from([n])
  if (n < 256) return Buffer.from([0x81, n])
  return Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff])
}

function berSeq(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), berLen(content.length), content])
}

function berOctet(s: string): Buffer {
  const b = Buffer.from(s, 'utf8')
  return Buffer.concat([Buffer.from([0x04]), berLen(b.length), b])
}

function berInt(n: number): Buffer {
  const bytes: number[] = []
  do {
    bytes.unshift(n & 0xff)
    n >>>= 8
  } while (n > 0)
  if (bytes[0] & 0x80) bytes.unshift(0)
  return berSeq(0x02, Buffer.from(bytes))
}

// Build an LDAPMessage envelope
function ldapMsg(msgId: number, appTag: number, appContent: Buffer): Buffer {
  const app = berSeq(0x60 | appTag, appContent)
  const seq = berSeq(0x30, Buffer.concat([berInt(msgId), app]))
  return seq
}

// BindRequest (tag 0) — simple auth
function buildBind(msgId: number, dn: string, pass: string): Buffer {
  const ver = berInt(3)
  const name = berOctet(dn)
  const auth = Buffer.concat([Buffer.from([0x80]), berLen(Buffer.byteLength(pass, 'utf8')), Buffer.from(pass, 'utf8')])
  return ldapMsg(msgId, 0, Buffer.concat([ver, name, auth]))
}

// SearchRequest (tag 3) — search for sAMAccountName
function buildSearch(msgId: number, base: string, filter: string, attrs: string[]): Buffer {
  const baseOctet = berOctet(base)
  const scope     = Buffer.from([0x0a, 0x01, 0x02])   // wholeSubtree
  const deref     = Buffer.from([0x0a, 0x01, 0x00])
  const sizeLimit = berInt(0)
  const timeLimit = Buffer.from([0x02, 0x01, 0x1e])    // 30 s
  const typesOnly = Buffer.from([0x01, 0x01, 0x00])
  // Simple equality filter: (sAMAccountName=<value>)
  const attrName  = berOctet('sAMAccountName')
  const attrVal   = berOctet(filter)
  const eqFilter  = berSeq(0xa3, Buffer.concat([attrName, attrVal]))
  // AttributeDescriptionList
  const attrList  = Buffer.concat(attrs.map(a => berOctet(a)))
  const attrSeq   = berSeq(0x30, attrList)
  return ldapMsg(msgId, 3, Buffer.concat([baseOctet, scope, deref, sizeLimit, timeLimit, typesOnly, eqFilter, attrSeq]))
}

function berTaggedOctet(tag: number, value: string): Buffer {
  const bytes = Buffer.from(value.trim(), 'utf8')
  return Buffer.concat([Buffer.from([tag]), berLen(bytes.length), bytes])
}

function equalityFilter(attribute: string, value: string): Buffer {
  return berSeq(0xa3, Buffer.concat([berOctet(attribute), berOctet(value.trim())]))
}

function buildAbbreviationFilter(first: string, last: string): Buffer {
  const substringParts = berSeq(0x30, Buffer.concat([
    berTaggedOctet(0x80, first),
    berTaggedOctet(0x82, last),
  ]))
  const substring = berSeq(0xa4, Buffer.concat([berOctet('displayName'), substringParts]))
  return berSeq(0xa0, Buffer.concat([
    equalityFilter('objectCategory', 'person'),
    equalityFilter('objectClass', 'user'),
    substring,
  ]))
}

function buildAbbreviationSearch(msgId: number, base: string, first: string, last: string): Buffer {
  const baseOctet = berOctet(base)
  const scope = Buffer.from([0x0a, 0x01, 0x02])
  const deref = Buffer.from([0x0a, 0x01, 0x00])
  const sizeLimit = berInt(0)
  const timeLimit = Buffer.from([0x02, 0x01, 0x1e])
  const typesOnly = Buffer.from([0x01, 0x01, 0x00])
  const attrList = Buffer.concat(['displayName', 'sAMAccountName'].map(berOctet))
  const attrSeq = berSeq(0x30, attrList)
  return ldapMsg(msgId, 3, Buffer.concat([
    baseOctet, scope, deref, sizeLimit, timeLimit, typesOnly,
    buildAbbreviationFilter(first, last), attrSeq,
  ]))
}

// UnbindRequest (tag 2)
function buildUnbind(msgId: number): Buffer {
  return ldapMsg(msgId, 2, Buffer.alloc(0))
}

// ── Low-level socket I/O ─────────────────────────────────────────────────────

type LdapConn = { write: (b: Buffer) => void; read: () => Promise<Buffer>; destroy: () => void }

function withTimeout<T>(ms: number, p: Promise<T>, msg: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))])
}

function connect(host: string, port: number): Promise<LdapConn> {
  return withTimeout(6000, new Promise((resolve, reject) => {
    const sock = createConnection({ host, port })
    const chunks: Buffer[] = []
    let waiting: ((b: Buffer) => void) | null = null

    sock.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      if (waiting) { const w = waiting; waiting = null; w(Buffer.concat(chunks.splice(0))) }
    })
    sock.on('error', reject)
    sock.on('connect', () => {
      resolve({
        write: (b) => sock.write(b),
        read: () => withTimeout(8000,
          new Promise<Buffer>(res => {
            if (chunks.length) { res(Buffer.concat(chunks.splice(0))); return }
            waiting = res
          }),
          'LDAP read timeout'
        ),
        destroy: () => sock.destroy(),
      })
    })
  }), 'LDAP connect timeout')
}

// Parse result code from an LDAPMessage response
function parseResultCode(buf: Buffer): number {
  // Walk past: 0x30 len msgId app-tag len → result-code at ~offset 7-9
  let i = 0
  if (buf[i++] !== 0x30) return 255
  // skip outer length (1-3 bytes)
  if (buf[i] & 0x80) i += (buf[i] & 0x7f) + 1; else i++
  // skip messageID (0x02 0x01 n)
  i += 3
  // skip app tag + length
  i++
  if (buf[i] & 0x80) i += (buf[i] & 0x7f) + 1; else i++
  // result code is 0x0a 0x01 <code>
  if (buf[i] === 0x0a && buf[i + 1] === 0x01) return buf[i + 2]
  return 255
}

function parseAttributeValue(buf: Buffer, attribute: string): string | null {
  const marker = Buffer.from(attribute)
  let pos = buf.indexOf(marker)
  if (pos < 0) return null
  pos += marker.length
  // skip attribute value set tag (0x31) + length
  if (buf[pos] !== 0x31) return null
  pos++
  if (buf[pos] & 0x80) pos += (buf[pos] & 0x7f) + 1; else pos++
  // octet string tag 0x04 + length + value
  if (buf[pos] !== 0x04) return null
  pos++
  let vlen = 0
  if (buf[pos] & 0x80) {
    const lb = buf[pos] & 0x7f; pos++
    for (let j = 0; j < lb; j++) { vlen = (vlen << 8) | buf[pos++] }
  } else { vlen = buf[pos++] }
  if (pos + vlen > buf.length) return null
  return buf.slice(pos, pos + vlen).toString('utf8')
}

// Parse an attribute from SearchResultEntry.
function parseDisplayName(buf: Buffer): string | null {
  return parseAttributeValue(buf, 'displayName')
}

type BerTlv = { tag: number; contentStart: number; contentEnd: number; end: number }

function readBerTlv(buffer: Buffer, offset: number): BerTlv | null {
  if (offset >= buffer.length || offset + 2 > buffer.length) return null
  const tag = buffer[offset]
  const firstLength = buffer[offset + 1]
  let headerLength = 2
  let contentLength = firstLength
  if (firstLength & 0x80) {
    const lengthBytes = firstLength & 0x7f
    if (lengthBytes === 0 || lengthBytes > 4) throw new Error('Invalid LDAP BER length')
    if (offset + 2 + lengthBytes > buffer.length) return null
    headerLength += lengthBytes
    contentLength = 0
    for (let i = 0; i < lengthBytes; i++) {
      contentLength = contentLength * 256 + buffer[offset + 2 + i]
    }
  }
  if (contentLength > 16 * 1024 * 1024) throw new Error('LDAP message is too large')
  const contentStart = offset + headerLength
  const end = contentStart + contentLength
  if (end > buffer.length) return null
  return { tag, contentStart, contentEnd: end, end }
}

function readBerInteger(buffer: Buffer, tlv: BerTlv): number {
  if (tlv.tag !== 0x02 || tlv.contentEnd - tlv.contentStart < 1 || tlv.contentEnd - tlv.contentStart > 4) {
    throw new Error('Invalid LDAP integer')
  }
  let value = 0
  for (let i = tlv.contentStart; i < tlv.contentEnd; i++) value = value * 256 + buffer[i]
  return value
}

function parseLdapMessage(buffer: Buffer): { messageId: number; operation: BerTlv } {
  const root = readBerTlv(buffer, 0)
  if (!root || root.tag !== 0x30 || root.end !== buffer.length) throw new Error('Invalid LDAP message')
  const messageIdTlv = readBerTlv(buffer, root.contentStart)
  if (!messageIdTlv || messageIdTlv.tag !== 0x02) throw new Error('LDAP message ID is missing')
  const operation = readBerTlv(buffer, messageIdTlv.end)
  if (!operation || operation.end !== root.contentEnd) throw new Error('LDAP operation is missing')
  return { messageId: readBerInteger(buffer, messageIdTlv), operation }
}

function parseSearchEntry(buffer: Buffer, entry: BerTlv): { displayName: string; account: string } | null {
  const objectName = readBerTlv(buffer, entry.contentStart)
  if (!objectName || objectName.tag !== 0x04) return null
  const attributes = readBerTlv(buffer, objectName.end)
  if (!attributes || attributes.tag !== 0x30 || attributes.end !== entry.contentEnd) return null

  let displayName = ''
  let account = ''
  let offset = attributes.contentStart
  while (offset < attributes.contentEnd) {
    const partialAttribute = readBerTlv(buffer, offset)
    if (!partialAttribute || partialAttribute.tag !== 0x30) return null
    const type = readBerTlv(buffer, partialAttribute.contentStart)
    if (!type || type.tag !== 0x04) return null
    const values = readBerTlv(buffer, type.end)
    if (!values || values.tag !== 0x31) return null
    const value = readBerTlv(buffer, values.contentStart)
    if (value && value.tag === 0x04) {
      const attributeName = buffer.slice(type.contentStart, type.contentEnd).toString('utf8').toLowerCase()
      const attributeValue = buffer.slice(value.contentStart, value.contentEnd).toString('utf8').trim()
      if (attributeName === 'displayname') displayName = attributeValue
      if (attributeName === 'samaccountname') account = attributeValue
    }
    offset = partialAttribute.end
  }
  return displayName && account ? { displayName, account } : null
}

function parseLdapResultCode(buffer: Buffer, operation: BerTlv): number {
  const resultCode = readBerTlv(buffer, operation.contentStart)
  if (!resultCode || resultCode.tag !== 0x0a) throw new Error('Invalid LDAP result')
  return readBerInteger(buffer, { ...resultCode, tag: 0x02 })
}

async function collectBindResultCode(readChunk: () => Promise<Buffer>, expectedMessageId: number): Promise<number> {
  let pending = Buffer.alloc(0)
  while (true) {
    pending = Buffer.concat([pending, await readChunk()])
    while (pending.length > 0) {
      const messageTlv = readBerTlv(pending, 0)
      if (!messageTlv) break
      if (messageTlv.tag !== 0x30) throw new Error('Invalid LDAP message frame')
      const message = pending.subarray(0, messageTlv.end)
      pending = pending.subarray(messageTlv.end)
      const parsed = parseLdapMessage(message)
      if (parsed.messageId !== expectedMessageId) continue
      if (parsed.operation.tag !== 0x61) throw new Error('Unexpected LDAP bind response')
      return parseLdapResultCode(message, parsed.operation)
    }
  }
}

async function collectSearchResults(
  readChunk: () => Promise<Buffer>,
  expectedMessageId: number,
): Promise<Array<{ displayName: string; account: string }>> {
  let pending = Buffer.alloc(0)
  const entries: Array<{ displayName: string; account: string }> = []

  while (true) {
    const chunk = await readChunk()
    if (!chunk.length) continue
    pending = Buffer.concat([pending, chunk])

    while (pending.length > 0) {
      const messageTlv = readBerTlv(pending, 0)
      if (!messageTlv) break
      if (messageTlv.tag !== 0x30) throw new Error('Invalid LDAP message frame')
      const message = pending.subarray(0, messageTlv.end)
      pending = pending.subarray(messageTlv.end)
      const parsed = parseLdapMessage(message)
      if (parsed.messageId !== expectedMessageId) continue
      if (parsed.operation.tag === 0x64) {
        const candidate = parseSearchEntry(message, parsed.operation)
        if (candidate) entries.push(candidate)
      } else if (parsed.operation.tag === 0x65) {
        if (parseLdapResultCode(message, parsed.operation) !== 0) {
          throw new Error('LDAP abbreviation search failed')
        }
        return entries
      }
    }
  }
}


// Shorten a display name to fit the 20-char username limit.
// Strategy: First [M.] Last  →  First Last  →  hard slice
const PARTICLES = new Set(['de','da','do','dos','das','e','di','del','van','von'])
export function abbreviateForUsername(name: string, max = 20): string {
  name = name.trim()
  if (name.length <= max) return name
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return name.slice(0, max)
  const first = parts[0]
  const last  = parts[parts.length - 1]
  // Collect particles that prefix the last surname
  const prefixes: string[] = []
  let i = parts.length - 2
  while (i > 0 && PARTICLES.has(parts[i].toLowerCase())) { prefixes.unshift(parts[i]); i-- }
  // Middle names (non-particle)
  const middles = parts.slice(1, parts.length - 1).filter(p => !PARTICLES.has(p.toLowerCase()))
  // Try: First [particles] Last
  const simple = [first, ...prefixes, last].join(' ')
  if (simple.length <= max) return simple
  // Try: First M. Last (first initial per middle word)
  const withInit = [first, ...middles.map(m => m[0] + '.'), last].join(' ')
  if (withInit.length <= max) return withInit
  // Try: First Last
  const bare = `${first} ${last}`
  if (bare.length <= max) return bare
  // Hard slice
  return bare.slice(0, max).trimEnd()
}

// ── Public API ───────────────────────────────────────────────────────────────

export type LdapAuthResult =
  // `account` is the sAMAccountName the user actually authenticated with. It is
  // the only stable identifier here: `fullName` is an abbreviation of the AD
  // displayName and changes whenever the AD record is corrected.
  | { ok: true;  fullName: string; account: string; displayName: string }
  | { ok: false; error: string }

export async function ldapAuthenticate(username: string, password: string): Promise<LdapAuthResult> {
  const { host, port } = parseHost(LDAP_URL)
  let conn: LdapConn | null = null

  try {
    conn = await connect(host, port)

    // 1. Bind as user
    const userDn = `${username}@${LDAP_DOMAIN}`
    conn.write(buildBind(1, userDn, password))
    const bindResp = await conn.read()
    const code = parseResultCode(bindResp)
    if (code !== 0) {
      conn.destroy()
      return { ok: false, error: code === 49 ? 'Invalid credentials' : 'Authentication failed' }
    }

    // 2. Search for displayName — try as authenticated user first, fall back to service account
    conn.write(buildSearch(2, LDAP_SEARCH_BASE, username, ['displayName']))
    const searchResp = await conn.read()
    let displayName = parseDisplayName(searchResp)

    // 3. If search returned nothing and we have a service account, re-bind as service and retry
    if (!displayName && LDAP_SVC_USER && LDAP_SVC_PASS) {
      conn.destroy()
      conn = await connect(host, port)
      conn.write(buildBind(3, serviceBindName(), LDAP_SVC_PASS))
      const svcResp = await conn.read()
      if (parseResultCode(svcResp) === 0) {
        conn.write(buildSearch(4, LDAP_SEARCH_BASE, username, ['displayName']))
        const r2 = await conn.read()
        displayName = parseDisplayName(r2)
      }
    }

    // Empty when the directory returned no displayName: callers must not store a
    // login id as somebody's full name.
    const fullDisplayName = (displayName || '').trim()
    conn.destroy()
    return {
      ok: true,
      fullName: abbreviateForUsername(displayName || username),
      account: username.toLowerCase(),
      displayName: fullDisplayName,
    }
  } catch (err: any) {
    conn?.destroy()
    const msg = err?.message || ''
    if (msg.includes('timeout')) return { ok: false, error: 'Authentication service unavailable' }
    return { ok: false, error: 'Authentication error' }
  }
}

export type AccountDisplayName = { account: string; displayName: string }

let missingServiceAccountLogged = false

/** Look up full AD display names for existing accounts with an isolated LDAP connection per account. */
export async function lookupDisplayNamesForAccounts(accounts: string[]): Promise<AccountDisplayName[]> {
  if (!LDAP_SVC_USER || !LDAP_SVC_PASS) {
    if (!missingServiceAccountLogged) {
      console.warn('[ldap] display-name backfill skipped: service account is not configured')
      missingServiceAccountLogged = true
    }
    return []
  }

  const { host, port } = parseHost(LDAP_URL)
  const candidates = [...new Set(accounts.map(account => account.trim().toLowerCase()).filter(Boolean))].slice(0, 500)
  const names: AccountDisplayName[] = []
  let failedLookups = 0

  for (const account of candidates) {
    let conn: LdapConn | null = null
    try {
      try {
        conn = await connect(host, port)
      } catch {
        console.warn('[ldap] display-name backfill skipped: directory is unavailable or timed out')
        break
      }

      let bindResp: Buffer
      try {
        conn.write(buildBind(1, serviceBindName(), LDAP_SVC_PASS))
        bindResp = await conn.read()
      } catch {
        console.warn('[ldap] display-name backfill skipped: service bind timed out or failed')
        break
      }
      if (parseResultCode(bindResp) !== 0) {
        console.warn('[ldap] display-name backfill skipped: service account bind failed')
        break
      }

      let response: Buffer
      try {
        conn.write(buildSearch(2, LDAP_SEARCH_BASE, account, ['displayName', 'sAMAccountName']))
        response = await conn.read()
      } catch {
        console.warn('[ldap] display-name backfill stopped after an LDAP search timeout or failure')
        break
      }
      const returnedAccount = parseAttributeValue(response, 'sAMAccountName')?.trim()
      const displayName = parseDisplayName(response)?.trim()
      if (returnedAccount?.toLowerCase() === account && displayName) {
        names.push({ account, displayName })
      } else {
        failedLookups++
      }
    } catch {
      failedLookups++
    } finally {
      conn?.destroy()
    }
  }

  if (failedLookups > 0) {
    console.warn(`[ldap] skipped ${failedLookups} display-name lookup(s)`)
  }
  return names
}

export type AbbreviationDisplayName = { abbrev: string; displayName: string; account: string }

function matchingAbbreviationCandidates(
  abbrev: string,
  candidates: Array<{ displayName: string; account: string }>,
): Map<string, { displayName: string; account: string }> {
  const expected = abbrev.trim().toLowerCase()
  const accounts = new Map<string, { displayName: string; account: string }>()
  for (const candidate of candidates) {
    const account = candidate.account.trim()
    const displayName = candidate.displayName.trim()
    if (!account || !displayName || abbreviateForUsername(displayName).toLowerCase() !== expected) continue
    const key = account.toLowerCase()
    if (!accounts.has(key)) accounts.set(key, { displayName, account })
  }
  return accounts
}

export const __test_buildAbbreviationFilter = buildAbbreviationFilter
export const __test_collectSearchResults = collectSearchResults
export const __test_selectUniqueAbbreviationMatch = (
  abbrev: string,
  candidates: Array<{ displayName: string; account: string }>,
): AbbreviationDisplayName | null => {
  const matches = matchingAbbreviationCandidates(abbrev, candidates)
  if (matches.size !== 1) return null
  const match = matches.values().next().value as { displayName: string; account: string }
  return { abbrev: abbrev.trim(), displayName: match.displayName, account: match.account }
}

/** Resolve abbreviated LDAP player names to a unique full AD name for display only. */
export async function lookupDisplayNamesByAbbreviation(names: string[]): Promise<AbbreviationDisplayName[]> {
  let conn: LdapConn | null = null
  let matched = 0
  let ambiguous = 0
  let notFound = 0
  let failed = 0
  const results: AbbreviationDisplayName[] = []
  const logCounts = () => console.info(
    `[ldap] abbreviation display-name lookup: matched=${matched} ambiguous=${ambiguous} not-found=${notFound} failed=${failed}`,
  )

  try {
    const uniqueNames = [...new Map(names
      .map(name => name.trim())
      .filter(Boolean)
      .map(name => [name.toLowerCase(), name] as const)).values()].slice(0, 300)
    if (!uniqueNames.length) {
      return []
    }

    if (!LDAP_SVC_USER || !LDAP_SVC_PASS) {
      if (!missingServiceAccountLogged) {
        console.warn('[ldap] abbreviation display-name backfill skipped: service account is not configured')
        missingServiceAccountLogged = true
      }
      failed = uniqueNames.length
      return []
    }

    const { host, port } = parseHost(LDAP_URL)
    try {
      conn = await connect(host, port)
    } catch {
      console.warn('[ldap] abbreviation display-name backfill skipped: directory is unavailable or timed out')
      failed = uniqueNames.length
      return []
    }

    try {
      conn.write(buildBind(1, serviceBindName(), LDAP_SVC_PASS))
      const bindResult = await collectBindResultCode(() => conn!.read(), 1)
      if (bindResult !== 0) {
        console.warn('[ldap] abbreviation display-name backfill skipped: service account bind failed')
        failed = uniqueNames.length
        return []
      }
    } catch {
      console.warn('[ldap] abbreviation display-name backfill skipped: service bind timed out or failed')
      failed = uniqueNames.length
      return []
    }

    let messageId = 2
    for (let index = 0; index < uniqueNames.length; index++) {
      const abbrev = uniqueNames[index]
      const parts = abbrev.split(/\s+/).filter(Boolean)
      const first = parts[0] || ''
      const last = parts[parts.length - 1] || first
      try {
        conn.write(buildAbbreviationSearch(messageId, LDAP_SEARCH_BASE, first, last))
        const entries = await collectSearchResults(() => conn!.read(), messageId)
        const matches = matchingAbbreviationCandidates(abbrev, entries)
        if (matches.size === 1) {
          const candidate = matches.values().next().value as { displayName: string; account: string }
          results.push({ abbrev, displayName: candidate.displayName, account: candidate.account })
          matched++
        } else if (matches.size > 1) {
          ambiguous++
        } else {
          notFound++
        }
        messageId++
      } catch {
        failed += uniqueNames.length - index
        console.warn('[ldap] abbreviation display-name backfill stopped after an LDAP search failure')
        break
      }
    }
  } catch {
    failed++
    console.warn('[ldap] abbreviation display-name backfill stopped after an unexpected error')
  } finally {
    try { conn?.destroy() } catch {}
    logCounts()
  }

  return results
}
