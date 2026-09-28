import { describe, it, expect } from 'vitest'
import { parseTagVersion, isNewerVersion, stripReleaseNotes } from '../src/utils/update.js'

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

describe('stripReleaseNotes —— Release 说明压成弹窗纯文本', () => {
  it('去标题/粗体/列表符/链接，保留文字', () => {
    const md = [
      '## 奶龙记账 v2.1.0',
      '',
      '### 🆕 固定支出自动记账',
      '- 配置一次就行',
      '- **同一个月绝不会重复记**',
      '详见 [Releases](https://github.com/x) 页面',
      '---'
    ].join('\n')
    const out = stripReleaseNotes(md, 200)
    expect(out).not.toContain('#')
    expect(out).not.toContain('**')
    expect(out).not.toContain('https://')
    expect(out).toContain('奶龙记账 v2.1.0')
    expect(out).toContain('· 配置一次就行')
    expect(out).toContain('同一个月绝不会重复记')
    expect(out).toContain('Releases')
  })

  it('超长截断加省略号；空说明返回空串；非法入参不抛错', () => {
    const long = stripReleaseNotes('x'.repeat(500), 120)
    expect(long.length).toBe(120)
    expect(long.endsWith('…')).toBe(true)
    expect(stripReleaseNotes('', 120)).toBe('')
    expect(stripReleaseNotes(null, 120)).toBe('')
    expect(stripReleaseNotes(undefined)).toBe('')
  })
})
