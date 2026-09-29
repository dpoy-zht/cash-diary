import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  WEBDAV_FILE,
  CONFIG_KEY,
  normalizeConfig,
  isConfigured,
  joinUrl,
  utf8Bytes,
  bytesToUtf8,
  bytesToBase64,
  utf8ToBase64,
  base64ToUtf8,
  obfuscate,
  deobfuscate,
  encodeConfig,
  decodeConfig,
  basicAuthHeader,
  buildPutOptions,
  buildGetOptions,
  parseRemoteBackup,
  looksLikeBackup,
  compareTimestamps
} from '../src/utils/webdav.js'

/** Node 的 Buffer 当"第三方标尺"：我们的纯 JS 实现必须跟它算出一样的结果 */
function nodeB64(str) {
  return Buffer.from(str, 'utf8').toString('base64')
}

describe('T4.5 —— WebDAV 配置归一化', () => {
  it('字段永远存在、永远是字符串，脏值不外泄', () => {
    expect(normalizeConfig(null)).toEqual({ url: '', user: '', pass: '' })
    expect(normalizeConfig({ url: '  https://x.com/dav  ', user: 123, pass: null })).toEqual({
      url: 'https://x.com/dav',
      user: '123',
      pass: ''
    })
    expect(normalizeConfig('oops')).toEqual({ url: '', user: '', pass: '' })
  })

  it('三样齐才算配置完成（少一样都认证不过去）', () => {
    expect(isConfigured({ url: 'https://x.com', user: 'a', pass: 'b' })).toBe(true)
    expect(isConfigured({ url: 'https://x.com', user: 'a', pass: '' })).toBe(false)
    expect(isConfigured({ url: 'https://x.com', user: '  ', pass: 'b' })).toBe(false)
    expect(isConfigured(null)).toBe(false)
  })
})

describe('T4.5 —— joinUrl 拼接', () => {
  it('结尾有 / 没 / 都对，不会出现双斜杠', () => {
    expect(joinUrl('https://dav.jianguoyun.com/dav', WEBDAV_FILE)).toBe('https://dav.jianguoyun.com/dav/' + WEBDAV_FILE)
    expect(joinUrl('https://dav.jianguoyun.com/dav/', WEBDAV_FILE)).toBe('https://dav.jianguoyun.com/dav/' + WEBDAV_FILE)
    expect(joinUrl('https://dav.jianguoyun.com/dav///', WEBDAV_FILE)).toBe('https://dav.jianguoyun.com/dav/' + WEBDAV_FILE)
  })

  it('回归：主机名带点时不能被当成文件名删掉', () => {
    // 曾经的写法取"整串最后一段"，会把 dav.example.com 当文件名 → 拼出 https:///…
    expect(joinUrl('https://dav.example.com', WEBDAV_FILE)).toBe('https://dav.example.com/' + WEBDAV_FILE)
    expect(joinUrl('https://www.mydav.cn', WEBDAV_FILE)).toBe('https://www.mydav.cn/' + WEBDAV_FILE)
  })

  it('用户填的是文件路径 → 换成我们的固定文件名', () => {
    expect(joinUrl('https://x.com/dav/old.json', WEBDAV_FILE)).toBe('https://x.com/dav/' + WEBDAV_FILE)
  })

  it('无协议的主机:端口/路径 也能拼（局域网 WebDAV）', () => {
    expect(joinUrl('192.168.1.9:5244/dav', WEBDAV_FILE)).toBe('192.168.1.9:5244/dav/' + WEBDAV_FILE)
  })

  it('空地址 → 空串（调用方据此判定不可用，而不是拼出 /file）', () => {
    expect(joinUrl('', WEBDAV_FILE)).toBe('')
    expect(joinUrl(null, WEBDAV_FILE)).toBe('')
    expect(joinUrl('   ', WEBDAV_FILE)).toBe('')
  })
})

describe('T4.5 —— UTF-8 / base64（中文与 emoji 都要能过）', () => {
  it('utf8Bytes / bytesToUtf8 互逆', () => {
    const cases = ['', 'abc', '奶龙记账', 'pass-word_123', '🐉🥛', '混合 mix 中文 🐲']
    cases.forEach(function (s) {
      expect(bytesToUtf8(utf8Bytes(s))).toBe(s)
    })
  })

  it('ASCII 走单字节、中文走三字节、emoji 走四字节', () => {
    expect(utf8Bytes('A')).toEqual([0x41])
    expect(utf8Bytes('奶').length).toBe(3)
    expect(utf8Bytes('🐉').length).toBe(4)
  })

  it('base64 结果与 Node Buffer 完全一致（含补位）', () => {
    const cases = ['a', 'ab', 'abc', 'abcd', '奶龙', '奶龙记账', '🐉', 'p@ss:w/rd+=']
    cases.forEach(function (s) {
      expect(utf8ToBase64(s)).toBe(nodeB64(s))
    })
  })

  it('base64 能解回原串（含中文密码）', () => {
    expect(base64ToUtf8(nodeB64('奶龙记账'))).toBe('奶龙记账')
    expect(base64ToUtf8(utf8ToBase64(''))).toBe('')
  })

  it('bytesToBase64 空数组 → 空串', () => {
    expect(bytesToBase64([])).toBe('')
    expect(bytesToBase64(null)).toBe('')
  })
})

describe('T4.5 —— 密码混淆（不是加密，但它得能还原）', () => {
  it('往返一致', () => {
    const cases = ['simple', 'p@ss word', '中文密码', 'a🐉b', '']
    cases.forEach(function (s) {
      expect(deobfuscate(obfuscate(s))).toBe(s)
    })
  })

  it('带 ob1: 前缀，且结果里不含原文（这是"不落明文"的最低要求）', () => {
    const enc = obfuscate('MySecretPass')
    expect(enc.indexOf('ob1:')).toBe(0)
    expect(enc.indexOf('MySecretPass')).toBe(-1)
  })

  it('认不出前缀 / 内容坏掉 → 空串（当没配过，不抛错）', () => {
    expect(deobfuscate('')).toBe('')
    expect(deobfuscate(null)).toBe('')
    expect(deobfuscate('plaintext')).toBe('')
    expect(deobfuscate('ob1:!!!not-base64!!!')).toBe('')
  })

  it('encodeConfig / decodeConfig 往返，密码字段被替换、其余原样', () => {
    const cfg = { url: 'https://x.com/dav', user: 'me@x.com', pass: 'app-pass' }
    const stored = encodeConfig(cfg)
    expect(stored.url).toBe(cfg.url)
    expect(stored.user).toBe(cfg.user)
    expect(stored.pass).not.toBe(cfg.pass)
    expect(decodeConfig(stored)).toEqual(cfg)
  })

  it('老数据（明文密码）原样读出，不会因为没前缀就丢掉', () => {
    expect(decodeConfig({ url: 'u', user: 'a', pass: 'legacy' })).toEqual({ url: 'u', user: 'a', pass: 'legacy' })
  })

  it('空密码不写混淆串（免得存一个 ob1: 的空壳）', () => {
    expect(encodeConfig({ url: 'u', user: 'a', pass: '' }).pass).toBe('')
  })
})

describe('T4.5 —— 认证头与请求参数', () => {
  it('Basic 头 = Base64(user:pass)，UTF-8 安全', () => {
    expect(basicAuthHeader('user', 'pass')).toBe('Basic ' + nodeB64('user:pass'))
    expect(basicAuthHeader('奶龙', '密码')).toBe('Basic ' + nodeB64('奶龙:密码'))
  })

  it('PUT：地址、方法、认证、octet-stream 与请求体', () => {
    const o = buildPutOptions({ url: 'https://x.com/dav', user: 'u', pass: 'p' }, '{"a":1}')
    expect(o.url).toBe('https://x.com/dav/' + WEBDAV_FILE)
    expect(o.method).toBe('PUT')
    expect(o.header.Authorization).toBe('Basic ' + nodeB64('u:p'))
    expect(o.header['Content-Type']).toBe('application/octet-stream')
    expect(o.data).toBe('{"a":1}')
    expect(o.timeout).toBeGreaterThan(0)
  })

  it('GET：地址与方法（不带请求体）', () => {
    const o = buildGetOptions({ url: 'https://x.com/dav/', user: 'u', pass: 'p' })
    expect(o.url).toBe('https://x.com/dav/' + WEBDAV_FILE)
    expect(o.method).toBe('GET')
    expect(o.data).toBeUndefined()
  })

  it('配置里带脏值也不会拼出脏请求', () => {
    const o = buildGetOptions({ url: '  https://x.com/dav  ', user: ' u ', pass: 'p' })
    expect(o.url).toBe('https://x.com/dav/' + WEBDAV_FILE)
    expect(o.header.Authorization).toBe('Basic ' + nodeB64('u:p'))
  })
})

describe('T4.5 —— 远端返回体解析与比对', () => {
  it('parseRemoteBackup：对象 / JSON 字符串 / 坏 JSON', () => {
    expect(parseRemoteBackup({ app: 'cash-diary' })).toEqual({ app: 'cash-diary' })
    expect(parseRemoteBackup('{"app":"cash-diary"}')).toEqual({ app: 'cash-diary' })
    expect(parseRemoteBackup('not json')).toBeNull()
    expect(parseRemoteBackup('')).toBeNull()
    expect(parseRemoteBackup(null)).toBeNull()
  })

  it('looksLikeBackup：挡掉同名但内容无关的文件', () => {
    expect(looksLikeBackup({ app: 'cash-diary' })).toBe(true)
    expect(looksLikeBackup({ app: 'other' })).toBe(false)
    expect(looksLikeBackup({})).toBe(false)
    expect(looksLikeBackup(null)).toBe(false)
  })

  it('compareTimestamps：谁更新', () => {
    expect(compareTimestamps(200, 100)).toBe('remote-newer')
    expect(compareTimestamps(100, 200)).toBe('local-newer')
    expect(compareTimestamps(100, 100)).toBe('same')
    expect(compareTimestamps(0, 0)).toBe('none')
    expect(compareTimestamps(null, null)).toBe('none')
  })

  it('compareTimestamps：缺一边时按已知的那边判（首次上传后云端有、本机没有）', () => {
    expect(compareTimestamps(500, 0)).toBe('remote-newer')
    expect(compareTimestamps(0, 500)).toBe('local-newer')
  })
})

/* ==================== services 层：存储与网络判断 ==================== */

const H = vi.hoisted(function () {
  return {
    backup: null,
    restoreCalls: [],
    requests: [],
    /** 下一次 uni.request 的行为：{ statusCode, data } 或 { fail: true } */
    next: null
  }
})

vi.mock('../src/services/backup.js', function () {
  return {
    exportJson: async function () {
      return JSON.stringify(H.backup)
    },
    restoreBackup: async function (obj) {
      H.restoreCalls.push(obj)
      return { transaction_record: (obj.transaction_record || []).length }
    }
  }
})

const webdav = await import('../src/services/webdav.js')

/** 最小 uni 替身：只有 storage 与 request（本项目实际用到的那几个 API） */
function installUni() {
  const store = new Map()
  globalThis.uni = {
    getStorageSync: function (k) { return store.has(k) ? store.get(k) : '' },
    setStorageSync: function (k, v) { store.set(k, v) },
    removeStorageSync: function (k) { store.delete(k) },
    request: function (opts) {
      H.requests.push(opts)
      const next = H.next || { statusCode: 200, data: '' }
      if (next.fail) {
        if (opts.fail) opts.fail({ errMsg: 'request:fail' })
        return
      }
      opts.success({ statusCode: next.statusCode, data: next.data })
    }
  }
  return store
}

describe('T4.5 —— 配置读写（services 层）', () => {
  beforeEach(function () {
    installUni()
    H.backup = null
    H.restoreCalls = []
    H.requests = []
    H.next = null
  })

  it('存进去的是混淆串，读出来是原文；存储里翻不到明文密码', () => {
    webdav.saveConfig({ url: 'https://x.com/dav', user: 'u', pass: 'TopSecret' })
    const raw = String(globalThis.uni.getStorageSync(CONFIG_KEY))
    expect(raw.indexOf('TopSecret')).toBe(-1)
    expect(webdav.loadConfig().pass).toBe('TopSecret')
    expect(webdav.loadConfig().url).toBe('https://x.com/dav')
  })

  it('合并保存：只传要改的字段，其它保持不变', () => {
    webdav.saveConfig({ url: 'https://x.com/dav', user: 'u', pass: 'p' })
    webdav.saveConfig({ user: 'other' })
    const cfg = webdav.loadConfig()
    expect(cfg.user).toBe('other')
    expect(cfg.url).toBe('https://x.com/dav')
    expect(cfg.pass).toBe('p')
  })

  it('存储里是坏 JSON → 当没配过，不抛错', () => {
    globalThis.uni.setStorageSync(CONFIG_KEY, '{oops')
    expect(webdav.loadConfig()).toEqual({ url: '', user: '', pass: '' })
    expect(webdav.isReady()).toBe(false)
  })

  it('清除配置后 isReady 为 false，但不动 lastSyncTs（同步历史与配置无关）', () => {
    webdav.saveConfig({ url: 'https://x.com/dav', user: 'u', pass: 'p' })
    expect(webdav.isReady()).toBe(true)
    webdav.clearConfig()
    expect(webdav.isReady()).toBe(false)
    expect(webdav.loadConfig()).toEqual({ url: '', user: '', pass: '' })
  })

  it('reasonText：每种失败都给人话', () => {
    expect(webdav.reasonText('not-configured')).toContain('还没配置')
    expect(webdav.reasonText('empty')).toContain('还没有备份')
    expect(webdav.reasonText('not-backup')).toContain('不是奶龙记账')
    expect(webdav.reasonText('network')).toContain('网络')
    expect(webdav.reasonText('http-401')).toContain('401')
    expect(webdav.reasonText('')).toContain('稍后')
  })
})

describe('T4.5 —— 上传 / 拉取 / 启动比对（网络层用替身）', () => {
  beforeEach(function () {
    installUni()
    H.requests = []
    H.next = null
    H.restoreCalls = []
    H.backup = {
      app: 'cash-diary',
      version: 2,
      exportedAt: 1000,
      account: [{ id: 1 }],
      category: [],
      transaction_record: [{ id: 1 }, { id: 2 }],
      budget: [],
      fixed_expense: []
    }
    webdav.saveConfig({ url: 'https://x.com/dav', user: 'u', pass: 'p' })
  })

  it('上传成功：PUT 到正确地址，并记住 exportedAt', async () => {
    H.next = { statusCode: 201, data: '' }
    const r = await webdav.uploadBackup()
    expect(H.requests.length).toBe(1)
    expect(H.requests[0].method).toBe('PUT')
    expect(H.requests[0].url).toBe('https://x.com/dav/' + WEBDAV_FILE)
    expect(JSON.parse(H.requests[0].data).transaction_record.length).toBe(2)
    expect(r.counts.transaction_record).toBe(2)
    expect(webdav.lastSyncAt()).toBe(1000)
  })

  it('上传被拒（HTTP 401）→ 抛错，且**不**更新 lastSyncTs（否则以后会误判云端是新的）', async () => {
    H.next = { statusCode: 401, data: '' }
    await expect(webdav.uploadBackup()).rejects.toThrow(/401/)
    expect(webdav.lastSyncAt()).toBe(0)
  })

  it('上传时网络挂了 → 抛"网络"错误而不是崩', async () => {
    H.next = { fail: true }
    await expect(webdav.uploadBackup()).rejects.toThrow(/网络/)
  })

  it('没配置就上传 → 明确报"还没配置"，不发请求', async () => {
    webdav.clearConfig()
    await expect(webdav.uploadBackup()).rejects.toThrow(/还没配置/)
    expect(H.requests.length).toBe(0)
  })

  it('拉取成功：识别出备份与条数', async () => {
    H.next = { statusCode: 200, data: JSON.stringify(H.backup) }
    const r = await webdav.fetchRemote()
    expect(r.ok).toBe(true)
    expect(r.exportedAt).toBe(1000)
    expect(r.counts.transaction_record).toBe(2)
  })

  it('拉取：404 → empty（云端还没有备份）', async () => {
    H.next = { statusCode: 404, data: '' }
    const r = await webdav.fetchRemote()
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('empty')
  })

  it('拉取：内容不是我们的备份 → not-backup', async () => {
    H.next = { statusCode: 200, data: '{"app":"someone-else"}' }
    expect((await webdav.fetchRemote()).reason).toBe('not-backup')
  })

  it('拉取：断网 → network，且不抛错（启动比对靠它静默）', async () => {
    H.next = { fail: true }
    expect((await webdav.fetchRemote()).reason).toBe('network')
  })

  it('从云端恢复：拉取 → 走 restoreBackup 整库替换 → 记住 exportedAt', async () => {
    H.next = { statusCode: 200, data: JSON.stringify(H.backup) }
    const counts = await webdav.restoreFromRemote()
    expect(H.restoreCalls.length).toBe(1)
    expect(counts.transaction_record).toBe(2)
    expect(webdav.lastSyncAt()).toBe(1000)
  })

  it('从云端恢复：拉不到就抛错，绝不半途动本机数据', async () => {
    H.next = { statusCode: 404, data: '' }
    await expect(webdav.restoreFromRemote()).rejects.toThrow(/还没有备份/)
    expect(H.restoreCalls.length).toBe(0)
  })

  it('启动比对：没配置 → 直接 return，不打网络', async () => {
    webdav.clearConfig()
    const r = await webdav.checkRemoteOnStart(5000)
    expect(r.checked).toBe(false)
    expect(H.requests.length).toBe(0)
  })

  it('启动比对：云端更新 → remote-newer（引导恢复）', async () => {
    H.next = { statusCode: 200, data: JSON.stringify(Object.assign({}, H.backup, { exportedAt: 9000 })) }
    const r = await webdav.checkRemoteOnStart(10000)
    expect(r.checked).toBe(true)
    expect(r.action).toBe('remote-newer')
    expect(H.requests.length).toBe(1)
  })

  it('启动比对：云端比本机上次同步还旧 → local-newer（引导上传）', async () => {
    H.next = { statusCode: 201, data: '' }
    await webdav.uploadBackup() // 先同步一次，lastSyncTs = 1000
    H.requests = []
    H.next = { statusCode: 200, data: JSON.stringify(Object.assign({}, H.backup, { exportedAt: 800 })) }
    const r = await webdav.checkRemoteOnStart(10000)
    expect(r.action).toBe('local-newer')
  })

  it('启动比对：两边一致 → same（不打扰）', async () => {
    H.next = { statusCode: 201, data: '' }
    await webdav.uploadBackup()
    H.requests = []
    H.next = { statusCode: 200, data: JSON.stringify(H.backup) }
    const r = await webdav.checkRemoteOnStart(10000)
    expect(r.action).toBe('same')
  })

  it('启动比对：12 小时内只查一次（节流；避免每次开 App 都打一次网络）', async () => {
    H.next = { statusCode: 200, data: JSON.stringify(Object.assign({}, H.backup, { exportedAt: 9000 })) }
    const first = await webdav.checkRemoteOnStart(10000)
    expect(first.checked).toBe(true)
    const before = H.requests.length
    const second = await webdav.checkRemoteOnStart(10000 + 60 * 1000)
    expect(second.checked).toBe(false)
    expect(second.reason).toBe('throttled')
    expect(H.requests.length).toBe(before) // 没有再打网络
  })

  it('启动比对：即使查不到（断网）也记节流，不会每次启动都卡一次超时', async () => {
    H.next = { fail: true }
    const first = await webdav.checkRemoteOnStart(20000)
    expect(first.checked).toBe(true)
    expect(first.reason).toBe('network')
    const before = H.requests.length
    const second = await webdav.checkRemoteOnStart(20000 + 60 * 1000)
    expect(second.checked).toBe(false)
    expect(H.requests.length).toBe(before)
  })
})
