/**
 * SHA-256 / base64 标准向量测试（T2.5 wgt 热更完整性校验的哈希基础）。
 * 向量来自 NIST FIPS 180-4 示例与 SHA-256 公开测试集，错一个位都过不了。
 */
import { describe, it, expect } from 'vitest'
import { sha256Hex, base64ToBytes } from '../src/utils/sha256.js'

describe('sha256Hex —— NIST 标准向量', () => {
  it('空串', () => {
    expect(sha256Hex(new Uint8Array(0)))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('"abc"（单块）', () => {
    expect(sha256Hex(new TextEncoder().encode('abc')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('448 位向量（跨块填充边界）', () => {
    const msg = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    expect(sha256Hex(new TextEncoder().encode(msg)))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
  })

  it('多块长输入（"a" × 1000）', () => {
    // 已知值：sha256("a".repeat(1000)) = 41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3
    expect(sha256Hex(new TextEncoder().encode('a'.repeat(1000))))
      .toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3')
  })

  it('非 8 位倍数长度（56 字节消息，测总长对齐）', () => {
    // 权威值经 Python hashlib.sha256(b'a'*56) 独立复核
    expect(sha256Hex(new TextEncoder().encode('a'.repeat(56))))
      .toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a')
  })
})

describe('base64ToBytes', () => {
  it('标准 base64 解码（含 dataURL 前缀容忍）', () => {
    expect(Array.from(base64ToBytes('YWJj'))).toEqual([97, 98, 99]) // "abc"
    expect(Array.from(base64ToBytes('data:application/octet-stream;base64,YWJj')))
      .toEqual([97, 98, 99])
  })

  it('带 padding 与空白', () => {
    expect(Array.from(base64ToBytes('YQ=='))).toEqual([97])
    expect(Array.from(base64ToBytes('YWI=\n'))).toEqual([97, 98])
  })

  it('与 sha256Hex 联动：base64("abc") 的哈希 = "abc" 的哈希', () => {
    expect(sha256Hex(base64ToBytes('YWJj')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('空 / 非法输入返回空字节序列，不抛错', () => {
    expect(base64ToBytes('').length).toBe(0)
    expect(base64ToBytes(null).length).toBe(0)
    expect(base64ToBytes('!!!').length).toBe(0)
  })
})
