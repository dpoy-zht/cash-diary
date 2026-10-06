import { describe, it, expect, afterEach } from 'vitest'
import {
  parseTagVersion, isNewerVersion, stripReleaseNotes, pickUpdateAssets,
  parseWgtVersionFromName, parseWgtSha256, buildWgtSources
} from '../src/utils/update.js'
import { currentAppVersion } from '../src/services/update.js'

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
      '## 奶蛙记账 v2.1.0',
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
    expect(out).toContain('奶蛙记账 v2.1.0')
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

describe('wgt 资产解析（pickUpdateAssets / parseWgtVersionFromName）', () => {
  const P = 'nailong-ledger-v'

  it('parseWgtVersionFromName：标准名解析，不匹配返回空串', () => {
    expect(parseWgtVersionFromName('nailong-ledger-v2.2.0.wgt', P)).toBe('2.2.0')
    expect(parseWgtVersionFromName('nailong-ledger-v3.0.0.wgt', P)).toBe('3.0.0')
    expect(parseWgtVersionFromName('其他文件.wgt', P)).toBe('')
    expect(parseWgtVersionFromName('nailong-ledger-v2.2.0.apk', P)).toBe('')
    expect(parseWgtVersionFromName(null, P)).toBe('')
  })

  it('pickUpdateAssets：wgt 与 apk 分别挑出（各取第一个）', () => {
    const assets = [
      { name: 'nailong-ledger-v2.2.0.wgt', browser_download_url: 'https://x/wgt1' },
      { name: 'nailong-ledger-v2.2.0.apk', browser_download_url: 'https://x/apk1' },
      { name: '源码.zip', browser_download_url: 'https://x/src' }
    ]
    const r = pickUpdateAssets(assets, P)
    expect(r.wgtUrl).toBe('https://x/wgt1')
    expect(r.wgtVersion).toBe('2.2.0')
    expect(r.apkUrl).toBe('https://x/apk1')
  })

  it('pickUpdateAssets：无 wgt 时 apkUrl 仍被挑出（走整包回退）', () => {
    const r = pickUpdateAssets([
      { name: 'nailong-ledger-v2.2.0.apk', browser_download_url: 'https://x/apk' }
    ], P)
    expect(r.wgtUrl).toBe('')
    expect(r.apkUrl).toBe('https://x/apk')
  })

  it('非法 assets 不抛错', () => {
    expect(pickUpdateAssets(null, P)).toEqual({ wgtUrl: '', wgtVersion: '', apkUrl: '' })
    expect(pickUpdateAssets([1, 'x'], P)).toEqual({ wgtUrl: '', wgtVersion: '', apkUrl: '' })
  })
})

describe('currentAppVersion —— 版本读取优先级（wgt 热更后防循环的关键）', () => {
  const originalUni = globalThis.uni
  const originalPlus = globalThis.plus

  afterEach(() => {
    if (originalUni === undefined) delete globalThis.uni
    else globalThis.uni = originalUni
    if (originalPlus === undefined) delete globalThis.plus
    else globalThis.plus = originalPlus
  })

  it('优先 appWgtVersion（资源包版本，热更后立即变新）', () => {
    globalThis.uni = { getAppBaseInfo: () => ({ appVersion: '2.2.0', appWgtVersion: '2.2.1' }) }
    delete globalThis.plus
    expect(currentAppVersion()).toBe('2.2.1')
  })

  it('appWgtVersion 为空时回落 appVersion（未热更过的纯 APK 安装）', () => {
    globalThis.uni = { getAppBaseInfo: () => ({ appVersion: '2.2.0' }) }
    delete globalThis.plus
    expect(currentAppVersion()).toBe('2.2.0')
  })

  it('无 getAppBaseInfo 时回落 plus.runtime.version（旧运行时兜底）', () => {
    delete globalThis.uni
    globalThis.plus = { runtime: { version: '2.2.0' } }
    expect(currentAppVersion()).toBe('2.2.0')
  })

  it('H5 / 测试环境（uni、plus 均无版本能力）返回空串，不抛错', () => {
    delete globalThis.uni
    delete globalThis.plus
    expect(currentAppVersion()).toBe('')
  })

  it('getAppBaseInfo 抛异常时安全降级不崩溃', () => {
    globalThis.uni = { getAppBaseInfo: () => { throw new Error('boom') } }
    delete globalThis.plus
    expect(currentAppVersion()).toBe('')
  })
})

describe('parseWgtSha256 —— 从 Release 说明解析 wgt 哈希（T2.5）', () => {
  const HEX = 'f7eb127699b33db8a48bce7c61173b5f9a577bb9b0492169eabc3f2cd9cada15'

  it('标准约定行（wgt-sha256: <hex>）', () => {
    expect(parseWgtSha256('## 校验\n- wgt-sha256: ' + HEX + '\n')).toBe(HEX)
  })

  it('容忍全角冒号 / 无冒号空格等变体，大写转小写', () => {
    expect(parseWgtSha256('wgt-sha256：' + HEX.toUpperCase())).toBe(HEX)
    expect(parseWgtSha256('wgt_sha256=' + HEX)).toBe(HEX)
  })

  it('没有该行 / 空 body → 返回空串（灰度兼容旧 Release）', () => {
    expect(parseWgtSha256('## 更新内容\n没有哈希行')).toBe('')
    expect(parseWgtSha256('')).toBe('')
    expect(parseWgtSha256(null)).toBe('')
  })

  it('非法 hex（长度/字符不符）不算命中', () => {
    expect(parseWgtSha256('wgt-sha256: abc123')).toBe('')
    expect(parseWgtSha256('wgt-sha256: ' + 'g'.repeat(64))).toBe('')
  })
})

/**
 * wgt 多源下载（2026-10-06 真机定位到 GitHub 直连时通时不通）。
 *
 * 实测证据：同一台手机同一网络，直连 GitHub 时出现
 *   "Connected + SSL OK 但 0 bytes received" 卡到超时；
 * 而 ghfast.top（3.4s）与 cdn.jsdelivr.net（6.6s）都能完整下到 572,774 B。
 * 所以单一源不可靠，必须按顺序试多个。
 */
describe('buildWgtSources —— 生成多源下载地址', () => {
  const url = 'https://github.com/dpoy-zht/cash-diary/releases/download/v2.3.3/nailong-ledger-v2.3.3.wgt'

  it('生成 2 个源：ghfast 加速 + 原地址兜底', () => {
    const list = buildWgtSources(url)
    expect(list.length).toBe(2)
    expect(list[1]).toBe(url)
  })

  it('ghfast 用通用加速形式（整条 URL 包进去）', () => {
    expect(buildWgtSources(url)[0]).toBe('https://ghfast.top/' + url)
  })

  it('所有源都非空、https、指向 .wgt', () => {
    buildWgtSources(url).forEach(function (u) {
      expect(u.startsWith('https://')).toBe(true)
      expect(u.endsWith('.wgt')).toBe(true)
    })
  })

  it('空输入返回空数组（不崩）', () => {
    expect(buildWgtSources('')).toEqual([])
    expect(buildWgtSources(null)).toEqual([])
    expect(buildWgtSources(undefined)).toEqual([])
  })

  it('非 GitHub 链接只返回原地址（不乱加代理）', () => {
    const other = 'https://example.com/a/b.wgt'
    expect(buildWgtSources(other)).toEqual([other])
  })

  it('代理排第一、直连排最后（直连会随机断流，实测 4 次全部残包）', () => {
    // 这条顺序是性能契约：直连每次都在随机位置断流（310,556 / 516,672 /
    // 262,144 B），前置它只会让用户干等超时。代理稳定 4~6 秒完整下到。
    const list = buildWgtSources(url)
    expect(list[0]).toBe('https://ghfast.top/' + url)
    expect(list[1]).toBe(url)
  })
})
