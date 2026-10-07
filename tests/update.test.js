import { describe, it, expect, afterEach } from 'vitest'
import {
  parseTagVersion, isNewerVersion, stripReleaseNotes, pickUpdateAssets,
  parseWgtVersionFromName, parseWgtSha256, parseWgtSize, buildWgtSources
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

/**
 * `wgt-size` 解析（2026-10-07 真机定位到的卡死原因）。
 *
 * App 端算 SHA-256 是纯 JS 逐字节运算（`utils/sha256.js`），
 * 572KB 的包在无 JIT 的引擎上慢一到两个数量级 → 界面卡在「正在更新…」。
 * 文件大小走原生 API 瞬时返回，且能抓住断流残包（实测下到 310K/516K/262K）。
 */
describe('parseWgtSize —— 解析 wgt 字节数', () => {
  it('标准格式 wgt-size: 572990', () => {
    expect(parseWgtSize('wgt-size: 572990')).toBe(572990)
  })

  it('容忍中文冒号与各种分隔符', () => {
    expect(parseWgtSize('wgt-size：572990')).toBe(572990)
    expect(parseWgtSize('wgt_size = 572990')).toBe(572990)
    expect(parseWgtSize('wgt-size=572990')).toBe(572990)
  })

  it('从多行Release 说明里提取', () => {
    const body = '## v2.3.9\n\n修bug\n\nwgt-sha256: 771f039a7d0510029416c54016b95ef9cf8d44509598a014b14a9a14fcb5b033\nwgt-size: 572990\n'
    expect(parseWgtSize(body)).toBe(572990)
  })

  it('没写 / 格式不对 / 空输入 → 返回 0（表示"不校验大小"而非"校验失败"）', () => {
    expect(parseWgtSize('')).toBe(0)
    expect(parseWgtSize(undefined)).toBe(0)
    expect(parseWgtSize('wgt-size: abc')).toBe(0)
    expect(parseWgtSize('随便一段说明')).toBe(0)
  })

  it('不会误认wgt-sha256 里的数字', () => {
    const body = 'wgt-sha256: 771f039a7d0510029416c54016b95ef9cf8d44509598a014b14a9a14fcb5b033'
    expect(parseWgtSize(body)).toBe(0)
  })
})

/**
 * 自建服务器源（2026-10-07）。
 *
 * 真机实测（同一时刻同一手机）：
 *   http://121.40.24.123/        → HTTP 200 / 0.079s  ✓ 快 120 倍
 *   https://ghfast.top/…        → 只下 294KB 就卡死（15s 超时）
 *   https://github.com/…（直连） → 9.7s，且随时断成残包
 * 所以主源换成本人服务器、GitHub 降级兜底。
 */
describe('自建更新源', () => {
  const SELF_URL = 'http://121.40.24.123/update/nailong-ledger-v2.3.10.wgt'

  it('自建源的 URL 不会被套上ghfast 代理', () => {
    // buildWgtSources 只对 github.com 的链接加代理，
    // 绝对 URL（自建源）必须原样返回，否则会拼出无效地址
    expect(buildWgtSources(SELF_URL)).toEqual([SELF_URL])
  })

  it('自建源是http 也不会被改动（App 端明文访问由 Android 侧配置处理）', () => {
    expect(buildWgtSources(SELF_URL)[0]).toBe(SELF_URL)
  })

  it('自建源 URL 不含 github.com 时不生成任何代理候选', () => {
    const list = buildWgtSources(SELF_URL)
    expect(list.length).toBe(1)
    expect(list[0]).not.toMatch(/ghfast/)
  })

  it('GitHub 源仍然带代理兜底（主源挂了仍能工作）', () => {
    const gh = 'https://github.com/dpoy-zht/cash-diary/releases/download/v2.3.10/x.wgt'
    expect(buildWgtSources(gh)[0]).toBe('https://ghfast.top/' + gh)
  })
})
