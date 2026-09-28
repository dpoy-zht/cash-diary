import { describe, it, expect } from 'vitest'
import { parseTagVersion, isNewerVersion } from '../src/utils/update.js'

describe('应用内更新检查 —— 版本比较（纯函数）', () => {
  it('parseTagVersion：带 v 前缀 / 不带 / 位数不齐都能解析', () => {
    expect(parseTagVersion('v2.1.0')).toEqual([2, 1, 0])
    expect(parseTagVersion('2.1.0')).toEqual([2, 1, 0])
    expect(parseTagVersion('v2.0')).toEqual([2, 0, 0])
    expect(parseTagVersion('  V3.10.2 ')).toEqual([3, 10, 2])
  })

  it('isNewerVersion：标准比较', () => {
    expect(isNewerVersion('v2.1.0', '2.0.1')).toBe(true)
    expect(isNewerVersion('v2.0.2', '2.0.1')).toBe(true)
    expect(isNewerVersion('v2.0.1', '2.0.1')).toBe(false)
    expect(isNewerVersion('v2.0.0', '2.0.1')).toBe(false)
    expect(isNewerVersion('v3.0.0', '2.9.9')).toBe(true)
  })

  it('位数不齐按补 0 比较（2.1 > 2.0.9）', () => {
    expect(isNewerVersion('v2.1', '2.0.9')).toBe(true)
    expect(isNewerVersion('v2.0', '2.0.1')).toBe(false)
  })

  it('解析失败 / 无意义输入一律返回 false（宁可不提示，不误报）', () => {
    expect(isNewerVersion('', '2.0.1')).toBe(false)
    expect(isNewerVersion('abc', '2.0.1')).toBe(false)
    expect(isNewerVersion(null, '2.0.1')).toBe(false)
    expect(isNewerVersion('v2.1.0', '')).toBe(false)
  })
})
