/**
 * WebDAV 云备份（T4.5）：配置归一化、认证头、URL 拼接、密码混淆、请求参数构造。
 *
 * 为什么全是纯函数：真机上这里跑网络，出问题只能看到"同步失败"四个字。
 * 把能算的部分（拼 URL、拼认证头、比时间戳）留给测试，真机只剩发请求这一件事。
 *
 * ⚠️ 关于"密码加密保存"的实话：
 * 这里做的是**混淆**（XOR + base64），不是加密 —— 密钥就在代码里，
 * 任何能读到本机存储的人都能还原出密码。它挡的是"密码明文躺在存储里被一眼看到"，
 * 挡不住真正想拿它的人。真正的保护是：WebDAV 走 HTTPS + 用应用专用密码
 * （坚果云/Nextcloud 都支持单独生成一个只读某目录的通行证）。
 * 这个定位必须写在界面上，不能让人以为存进去就安全了。
 */
import { base64ToBytes } from './sha256.js'
import { BACKUP_APP } from './backup.js'

/** 远端备份文件名：固定名字，多设备互相覆盖/接管都靠它对上 */
export const WEBDAV_FILE = 'nailong-ledger-backup.json'
/** 配置存储键 */
export const CONFIG_KEY = 'cashDiary.webdav.config'
/** 最近一次成功上传的时间戳存储键 */
export const LAST_SYNC_KEY = 'cashDiary.webdav.lastSyncTs'
/** 启动比对的最短间隔：12 小时（避免每次开 App 都打一次网络） */
export const CHECK_INTERVAL = 12 * 60 * 60 * 1000
/** 网络超时（毫秒） */
export const TIMEOUT = 15000

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** 混淆密钥：固定值 —— 只做"不明文"这一层，不是安全边界 */
const OBF_KEY = 'cash-diary-webdav-obf-v1'
/** 混淆串前缀：将来换算法时靠它区分旧数据 */
const OBF_PREFIX = 'ob1:'

/* ---------------- 配置 ---------------- */

/**
 * 归一化配置：字段永远存在、永远是字符串，脏值不会漏到网络层。
 * 不做"是否可用"的判断 —— 那是 isConfigured 的事，混在一起会让调用方猜。
 */
export function normalizeConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    url: String(r.url == null ? '' : r.url).trim(),
    user: String(r.user == null ? '' : r.user).trim(),
    pass: String(r.pass == null ? '' : r.pass)
  }
}

/** 三样齐了才算配置完成（缺一样都不可能认证成功，不如早点告诉用户） */
export function isConfigured(cfg) {
  const c = normalizeConfig(cfg)
  return !!(c.url && c.user && c.pass)
}

/**
 * 拼远端地址：容忍用户把结尾斜杠写少、写多，甚至把文件名也带上了。
 * - 'https://dav.jianguoyun.com/dav' + name → 'https://dav.jianguoyun.com/dav/name'
 * - '…/dav/' → 同上（不会出现双斜杠）
 * - '…/dav/other.json' → 换成本项目的固定文件名（用户填的是目录不是文件）
 *
 * 注意"最后一段"必须取 **路径部分** 的最后一段：主机名里也带点
 * （https://dav.example.com），拿整串判断会把主机名当文件名删掉，拼出 https:///…
 */
export function joinUrl(base, name) {
  const b = String(base == null ? '' : base).trim()
  if (!b) return ''
  const file = String(name == null ? '' : name)
  const scheme = b.indexOf('://')
  const pathStart = scheme === -1 ? b.indexOf('/') : b.indexOf('/', scheme + 3)
  let dir = b
  if (pathStart !== -1) {
    const seg = (b.slice(pathStart + 1).split('/').pop()) || ''
    // 路径最后一段带扩展名 → 用户填的是文件，把它换掉
    if (seg.indexOf('.') !== -1) dir = b.slice(0, b.length - seg.length)
  }
  return dir.replace(/\/+$/, '') + '/' + file
}

/* ---------------- base64 / UTF-8 ----------------
 * btoa 不能用于非 ASCII（会抛 InvalidCharacterError），中文密码/路径必须自己编码。
 */

/** 字符串 → UTF-8 字节数组 */
export function utf8Bytes(str) {
  const s = String(str == null ? '' : str)
  const out = []
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i)
    if (c < 0x80) {
      out.push(c)
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      // 代理对（emoji 等增补平面字符）：合成码点后按 4 字节写
      const c2 = s.charCodeAt(i + 1)
      i += 1
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
  }
  return out
}

/** UTF-8 字节数组 → 字符串（与 utf8Bytes 互逆） */
export function bytesToUtf8(bytes) {
  const b = bytes || []
  let out = ''
  for (let i = 0; i < b.length;) {
    const x = b[i]
    if (x < 0x80) {
      out += String.fromCharCode(x)
      i += 1
    } else if (x < 0xe0) {
      out += String.fromCharCode(((x & 0x1f) << 6) | (b[i + 1] & 0x3f))
      i += 2
    } else if (x < 0xf0) {
      out += String.fromCharCode(((x & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f))
      i += 3
    } else {
      const cp = ((x & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f)
      const v = cp - 0x10000
      out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff))
      i += 4
    }
  }
  return out
}

/** 字节数组 → 标准 base64（带 = 补位） */
export function bytesToBase64(bytes) {
  const b = bytes || []
  let out = ''
  for (let i = 0; i < b.length; i += 3) {
    const has1 = i + 1 < b.length
    const has2 = i + 2 < b.length
    const b0 = b[i]
    const b1 = has1 ? b[i + 1] : 0
    const b2 = has2 ? b[i + 2] : 0
    out += B64_CHARS[b0 >> 2]
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)]
    out += has1 ? B64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '='
    out += has2 ? B64_CHARS[b2 & 0x3f] : '='
  }
  return out
}

/** 字符串 → base64（UTF-8 安全） */
export function utf8ToBase64(str) {
  return bytesToBase64(utf8Bytes(str))
}

/** base64 → 字符串（UTF-8 安全；解码复用 sha256.js 的实现） */
export function base64ToUtf8(b64) {
  return bytesToUtf8(base64ToBytes(b64))
}

/* ---------------- 密码混淆（不是加密，见文件头） ---------------- */

/** 混淆：'ob1:' + base64(XOR(utf8(pass))) */
export function obfuscate(plain) {
  const bytes = utf8Bytes(plain)
  const key = utf8Bytes(OBF_KEY)
  const out = bytes.map(function (b, i) { return b ^ key[i % key.length] })
  return OBF_PREFIX + bytesToBase64(out)
}

/**
 * 严格的 base64 判断：长度是 4 的倍数 + 字符全合法。
 * 为什么不用 base64ToBytes 自己容错（它会剔除非法字符）——
 * 那样 "!!!not-base64!!!" 会被清洗成 "notbase64" 解出一串乱码，
 * 界面上就变成"明明没配过却报 401"。宁可判成"解不开"，当没配过处理。
 */
function isStrictBase64(s) {
  if (!s || s.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s)
}

/** 反混淆：认不出前缀 / 内容坏掉 → 空串（当作没配过，而不是抛错让整个页面崩） */
export function deobfuscate(enc) {
  const s = String(enc == null ? '' : enc)
  if (s.indexOf(OBF_PREFIX) !== 0) return ''
  const body = s.slice(OBF_PREFIX.length)
  if (!isStrictBase64(body)) return ''
  try {
    const raw = base64ToBytes(body)
    const key = utf8Bytes(OBF_KEY)
    const out = []
    for (let i = 0; i < raw.length; i += 1) out.push(raw[i] ^ key[i % key.length])
    return bytesToUtf8(out)
  } catch (e) {
    return ''
  }
}

/** 存盘用：密码混淆后写，其余字段原样 */
export function encodeConfig(cfg) {
  const c = normalizeConfig(cfg)
  return c.pass ? Object.assign({}, c, { pass: obfuscate(c.pass) }) : c
}

/** 读取用：识别混淆前缀就还原；老数据（明文）原样返回 */
export function decodeConfig(raw) {
  const c = normalizeConfig(raw)
  return c.pass.indexOf(OBF_PREFIX) === 0 ? Object.assign({}, c, { pass: deobfuscate(c.pass) }) : c
}

/* ---------------- 请求 ---------------- */

/** 认证头：Basic base64(user:pass)，UTF-8 安全 */
export function basicAuthHeader(user, pass) {
  return 'Basic ' + utf8ToBase64(String(user == null ? '' : user) + ':' + String(pass == null ? '' : pass))
}

/**
 * 上传（PUT）的请求参数。
 * Content-Type 用 application/octet-stream：部分 WebDAV（坚果云）对 JSON 会插入
 * 反爬/预览处理，原样 octet-stream 上传才是"字节进字节出"。
 */
export function buildPutOptions(cfg, text) {
  const c = normalizeConfig(cfg)
  return {
    url: joinUrl(c.url, WEBDAV_FILE),
    method: 'PUT',
    timeout: TIMEOUT,
    data: String(text == null ? '' : text),
    header: {
      Authorization: basicAuthHeader(c.user, c.pass),
      'Content-Type': 'application/octet-stream'
    }
  }
}

/** 下载（GET）的请求参数 */
export function buildGetOptions(cfg) {
  const c = normalizeConfig(cfg)
  return {
    url: joinUrl(c.url, WEBDAV_FILE),
    method: 'GET',
    timeout: TIMEOUT,
    header: { Authorization: basicAuthHeader(c.user, c.pass) }
  }
}

/**
 * 远端返回体 → 备份对象。
 * uni.request 在 content-type 是 json 时已经把 data 解成对象，octet-stream 时给字符串，
 * 两种都要认；解不出来返回 null（调用方按"云端没有可用备份"处理）。
 */
export function parseRemoteBackup(data) {
  if (!data) return null
  if (typeof data === 'object') return data
  try {
    return JSON.parse(String(data))
  } catch (e) {
    return null
  }
}

/** 是不是本应用的备份（挡掉同名但内容无关的文件） */
export function looksLikeBackup(obj) {
  return !!(obj && typeof obj === 'object' && obj.app === BACKUP_APP)
}

/**
 * 时间戳比对：谁的数据更新。
 * @returns {'remote-newer'|'local-newer'|'same'|'none'}
 */
export function compareTimestamps(remoteTs, localTs) {
  const r = Number(remoteTs) || 0
  const l = Number(localTs) || 0
  if (!r && !l) return 'none'
  if (r > l) return 'remote-newer'
  if (l > r) return 'local-newer'
  return 'same'
}

