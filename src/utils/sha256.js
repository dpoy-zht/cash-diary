/**
 * 纯 JS SHA-256 与 base64 解码（T2.5 wgt 热更完整性校验用）。
 *
 * 为什么自己实现：App 端（plus 运行时）没有 WebCrypto/Node crypto 可用，
 * 而 wgt 下载完必须本地算哈希比对才能装。实现为标准 FIPS 180-4 单文件版，
 * 纯函数、可单测（tests/sha256.test.js 用 NIST 标准向量校验）。
 */

/* 64 个轮常数（FIPS 180-4 §4.2.2） */
const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

function rotr(x, n) {
  return (x >>> n) | (x << (32 - n))
}

/**
 * SHA-256：输入 Uint8Array（或类数组的字节序列），输出 64 位小写 hex。
 */
export function sha256Hex(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || [])
  const len = bytes.length
  // 填充：原数据 + 0x80 + 0*pad + 64 位大端长度，总长对齐到 512 位块
  const total = ((len + 9 + 63) >> 6) << 6
  const buf = new Uint8Array(total)
  buf.set(bytes)
  buf[len] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(total - 8, Math.floor(len / 536870912)) // 长度高 32 位（len*8 / 2^32）
  dv.setUint32(total - 4, (len << 3) >>> 0)             // 长度低 32 位

  const H = new Int32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ])
  const w = new Int32Array(64)

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getInt32(off + i * 4)
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let a = H[0]
    let b = H[1]
    let c = H[2]
    let d = H[3]
    let e = H[4]
    let f = H[5]
    let g = H[6]
    let h = H[7]
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      h = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    H[0] = (H[0] + a) | 0
    H[1] = (H[1] + b) | 0
    H[2] = (H[2] + c) | 0
    H[3] = (H[3] + d) | 0
    H[4] = (H[4] + e) | 0
    H[5] = (H[5] + f) | 0
    H[6] = (H[6] + g) | 0
    H[7] = (H[7] + h) | 0
  }

  let out = ''
  for (let i = 0; i < 8; i += 1) {
    out += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8)
  }
  return out
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * base64 → 字节（容忍 dataURL 前缀；非法字符忽略）。
 * 注意必须先剥离 "base64," 标记再清洗：dataURL 前缀里的字母和 "/" 都可能
 * 被误认成 base64 字符混进结果。用于把 readAsDataURL 读到的 wgt 内容转成可哈希的字节序列。
 */
export function base64ToBytes(b64) {
  let s = String(b64 || '')
  const marker = s.indexOf('base64,')
  if (marker !== -1) s = s.slice(marker + 7)
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, '')
  const eq = clean.indexOf('=')
  const valid = eq === -1 ? clean : clean.slice(0, eq)
  const out = new Uint8Array(Math.floor(valid.length * 3 / 4))
  let o = 0
  let acc = 0
  let bits = 0
  for (let i = 0; i < valid.length; i += 1) {
    acc = (acc << 6) | B64_CHARS.indexOf(valid.charAt(i))
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o] = (acc >> bits) & 0xff
      o += 1
    }
  }
  return out.subarray(0, o)
}
