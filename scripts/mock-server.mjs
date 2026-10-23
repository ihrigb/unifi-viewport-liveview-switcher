/**
 * Minimal HTTPS mock for the UniFi Protect local API.
 * Serves the four endpoints that unifi-api.ts calls.
 * Generates a fresh self-signed cert at startup — zero npm dependencies.
 *
 * Usage: node scripts/mock-server.mjs
 * Configure the app: host = 127.0.0.1:9443, any API key, skipTlsVerify = ON
 */

import https from 'node:https'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PORT = 9443

// ---------------------------------------------------------------------------
// Self-signed cert generation
// We try two methods in order:
//   1. openssl (present on most dev machines via Git for Windows, WSL, etc.)
//   2. Hand-crafted ASN.1 DER using only node:crypto (fallback)
// ---------------------------------------------------------------------------

function tryOpenssl() {
  const dir = join(tmpdir(), 'unifi-mock-cert')
  const keyFile = join(dir, 'key.pem')
  const certFile = join(dir, 'cert.pem')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}" ` +
      `-days 3650 -nodes -subj "/CN=localhost" 2>/dev/null`,
      { stdio: 'pipe' }
    )
    return { key: readFileSync(keyFile, 'utf8'), cert: readFileSync(certFile, 'utf8') }
  } catch {
    return null
  }
}

/**
 * Builds a minimal self-signed X.509 v1 cert from scratch.
 * No SANs — that's fine because Node's http.request with rejectUnauthorized=false
 * (which is what skipTlsVerify maps to) doesn't validate the cert at all.
 */
function buildCertManually(keyPair) {
  const { privateKey, publicKey } = keyPair

  // Export public key as DER SPKI
  const pubDer = publicKey.export({ type: 'spki', format: 'der' })

  // Helper to encode ASN.1 primitives
  function len(n) {
    if (n < 0x80) return Buffer.from([n])
    const b = []
    let tmp = n
    while (tmp > 0) { b.unshift(tmp & 0xff); tmp >>= 8 }
    return Buffer.from([0x80 | b.length, ...b])
  }
  function tlv(tag, ...contents) {
    const body = Buffer.concat(contents.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c)))
    return Buffer.concat([Buffer.from([tag]), len(body.length), body])
  }
  function seq(...c) { return tlv(0x30, ...c) }
  function set(...c) { return tlv(0x31, ...c) }
  function int(n) {
    let hex = n.toString(16)
    if (hex.length % 2) hex = '0' + hex
    const b = Buffer.from(hex, 'hex')
    // add 0x00 prefix if high bit set (avoid sign extension)
    return tlv(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), b]) : b)
  }
  function oid(dotted) {
    const parts = dotted.split('.').map(Number)
    const first = 40 * parts[0] + parts[1]
    const bytes = [first]
    for (let i = 2; i < parts.length; i++) {
      let v = parts[i]
      const seg = [v & 0x7f]
      v >>= 7
      while (v) { seg.unshift((v & 0x7f) | 0x80); v >>= 7 }
      bytes.push(...seg)
    }
    return tlv(0x06, Buffer.from(bytes))
  }
  function utf8str(s) { return tlv(0x0c, Buffer.from(s, 'utf8')) }
  function utctime(d) {
    // UTCTime: YYMMDDHHmmssZ
    const pad = n => String(n).padStart(2, '0')
    const y = d.getUTCFullYear() % 100
    const s = pad(y) + pad(d.getUTCMonth()+1) + pad(d.getUTCDate()) +
              pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
    return tlv(0x17, Buffer.from(s, 'ascii'))
  }
  function bitstr(b, unusedBits = 0) {
    return tlv(0x03, Buffer.from([unusedBits]), b)
  }

  const sha256WithRSA = oid('1.2.840.113549.1.1.11')
  const sigAlg = seq(sha256WithRSA, tlv(0x05)) // NULL params

  // subject/issuer: CN=localhost
  const cnOid = oid('2.5.4.3')
  const name = seq(set(seq(cnOid, utf8str('localhost'))))

  const now = new Date()
  const tenYears = new Date(now.getTime() + 10 * 365.25 * 24 * 3600 * 1000)
  const validity = seq(utctime(now), utctime(tenYears))

  // TBSCertificate (version defaults to v1 = omitted)
  const tbs = seq(
    int(1),      // serialNumber
    sigAlg,      // signature algorithm
    name,        // issuer
    validity,
    name,        // subject (self-signed)
    pubDer       // subjectPublicKeyInfo (already DER from .export())
  )

  // Sign TBSCertificate
  const sig = crypto.createSign('SHA256').update(tbs).sign(privateKey)

  // Full Certificate
  const certDer = seq(tbs, sigAlg, bitstr(sig))
  const certPem = '-----BEGIN CERTIFICATE-----\n' +
    certDer.toString('base64').match(/.{1,64}/g).join('\n') +
    '\n-----END CERTIFICATE-----\n'

  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  return { key: keyPem, cert: certPem }
}

function generateCert() {
  const fromOpenssl = tryOpenssl()
  if (fromOpenssl) return fromOpenssl

  const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  return buildCertManually(keyPair)
}

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

const LIVEVIEWS = [
  { id: 'lv-001', name: 'Front Door',  isDefault: true,  slots: [] },
  { id: 'lv-002', name: 'Backyard',    isDefault: false, slots: [] },
  { id: 'lv-003', name: 'Garage',      isDefault: false, slots: [] },
  { id: 'lv-004', name: 'Side Gate',   isDefault: false, slots: [] },
  { id: 'lv-005', name: 'Driveway',    isDefault: false, slots: [] },
]
const VIEWPORTS = [
  { id: 'viewport-001', name: 'Living Room TV', modelKey: 'viewport' }
]
let activeLiveviewId = LIVEVIEWS[0].id

setInterval(() => {
  const next = LIVEVIEWS[Math.floor(Math.random() * LIVEVIEWS.length)]
  activeLiveviewId = next.id
  console.log(`[mock] auto-switched → ${next.name}`)
}, 30_000)

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function respond(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  })
  res.end(json)
}

function readBody(req) {
  return new Promise(resolve => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
  })
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const BASE = '/proxy/protect/integration/v1'
const VIEWER_RE = new RegExp(`^${BASE}/viewers/([^/]+)$`)

const { key, cert } = generateCert()

https.createServer({ key, cert }, async (req, res) => {
  const path = req.url?.split('?')[0] ?? ''
  const m = path.match(VIEWER_RE)

  if (req.method === 'GET'   && path === `${BASE}/viewers`)   return respond(res, 200, VIEWPORTS)
  if (req.method === 'GET'   && path === `${BASE}/liveviews`) return respond(res, 200, LIVEVIEWS)
  if (req.method === 'GET'   && m) {
    return respond(res, 200, {
      id: m[1], name: 'Living Room TV', modelKey: 'viewport',
      liveview: { id: activeLiveviewId },
    })
  }
  if (req.method === 'PATCH' && m) {
    const body = await readBody(req)
    if (body.liveview) {
      activeLiveviewId = body.liveview
      const lv = LIVEVIEWS.find(l => l.id === activeLiveviewId)
      console.log(`[mock] active liveview → ${lv?.name ?? activeLiveviewId}`)
    }
    return respond(res, 200, { id: m[1], liveview: { id: activeLiveviewId } })
  }

  respond(res, 404, { error: 'not found', path })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n[mock-nvr] UniFi Protect mock running on https://127.0.0.1:${PORT}`)
  console.log('[mock-nvr] Configure the app:')
  console.log(`[mock-nvr]   Host:            127.0.0.1:${PORT}`)
  console.log('[mock-nvr]   API key:         any-value')
  console.log('[mock-nvr]   Skip TLS verify: ON\n')
})
