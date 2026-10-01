/**
 * WebDAV 云备份业务层（T4.5）：配置读写、上传、拉取、启动比对。
 *
 * 原则（与"检查更新"同一套）：
 * - **网络失败一律不打扰使用**：拉取比对失败就静默跳过，绝不能因为云端连不上
 *   让用户记不了账。只有用户手动点"上传/恢复"时才把失败原因说出来。
 * - 配置存在本机（密码混淆后存，见 utils/webdav.js 文件头对"加密"的说明）。
 * - 上传成功才记 lastSyncTs：失败还记时间会让"云端是否更新"永远判断错。
 */
import {
  CONFIG_KEY,
  LAST_SYNC_KEY,
  CHECK_INTERVAL,
  normalizeConfig,
  isConfigured,
  encodeConfig,
  decodeConfig,
  buildPutOptions,
  buildGetOptions,
  parseRemoteBackup,
  looksLikeBackup,
  compareTimestamps
} from '../utils/webdav.js'
import { shouldAutoBackup } from '../utils/backup.js'
import { exportJson, restoreBackup } from './backup.js'

/** 最近一次"启动比对"的时间（与 lastSyncTs 分开：比对不等于同步，不能混） */
const CHECK_KEY = 'cashDiary.webdav.lastCheckAt'

function readRaw(key) {
  try {
    const v = uni.getStorageSync(key)
    return v === '' || v === undefined || v === null ? null : v
  } catch (e) {
    return null
  }
}

function writeRaw(key, value) {
  try {
    uni.setStorageSync(key, value)
    return true
  } catch (e) {
    return false
  }
}

/* ---------------- 配置 ---------------- */

/** 读配置（密码自动还原）；存储坏掉时返回空配置，页面当"没配过"处理 */
export function loadConfig() {
  const raw = readRaw(CONFIG_KEY)
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch (e) {
      obj = null
    }
  }
  return decodeConfig(obj)
}

/** 合并保存（只传要改的字段）；返回归一化后的完整配置 */
export function saveConfig(patch) {
  const next = normalizeConfig(Object.assign({}, loadConfig(), patch || {}))
  writeRaw(CONFIG_KEY, JSON.stringify(encodeConfig(next)))
  return next
}

/** 清除配置（等于关闭云备份） */
export function clearConfig() {
  try {
    uni.removeStorageSync(CONFIG_KEY)
  } catch (e) { /* 清不掉也不算错 */ }
}

export function isReady() {
  return isConfigured(loadConfig())
}

/** 上次成功同步（上传或恢复）时，那份备份的 exportedAt */
export function lastSyncAt() {
  return Number(readRaw(LAST_SYNC_KEY)) || 0
}

function rememberSync(ts) {
  writeRaw(LAST_SYNC_KEY, Number(ts) || Date.now())
}

/* ---------------- 网络 ---------------- */

/** uni.request → Promise。网络层错误统一成 Error('network')，上层不用分辨平台差异 */
function request(opts) {
  return new Promise(function (resolve, reject) {
    uni.request(
      Object.assign({}, opts, {
        success: resolve,
        fail: function () { reject(new Error('network')) }
      })
    )
  })
}

function httpOk(code) {
  const c = Number(code)
  return c >= 200 && c < 300
}

/** 失败原因 → 人话（页面与弹窗共用） */
export function reasonText(reason) {
  const r = String(reason || '')
  if (r === 'not-configured') return '还没配置 WebDAV'
  if (r === 'empty') return '云端还没有备份文件'
  if (r === 'not-backup') return '云端那个文件不是奶龙记账的备份'
  if (r === 'network') return '网络连不上，稍后再试'
  if (r === 'throttled') return '刚刚已经检查过了'
  if (r.indexOf('http-') === 0) return '云端返回 ' + r.slice(5) + '，请检查地址或账号'
  return '同步失败，稍后再试'
}

function countsOf(backup) {
  const b = backup || {}
  return {
    account: (b.account || []).length,
    category: (b.category || []).length,
    transaction_record: (b.transaction_record || []).length,
    budget: (b.budget || []).length,
    fixed_expense: (b.fixed_expense || []).length,
    tag: (b.tag || []).length,
    transaction_tag: (b.transaction_tag || []).length
  }
}

/**
 * 上传：把本机全库导出成 JSON 覆盖到云端。
 * @returns {Promise<{exportedAt:number, counts:object}>}
 */
export async function uploadBackup() {
  const cfg = loadConfig()
  if (!isConfigured(cfg)) throw new Error(reasonText('not-configured'))
  const text = await exportJson()
  let res
  try {
    res = await request(buildPutOptions(cfg, text))
  } catch (e) {
    throw new Error(reasonText('network'), { cause: e })
  }
  // WebDAV 对 PUT 的常见成功码：200 已覆盖 / 201 已创建 / 204 无内容
  if (!httpOk(res && res.statusCode)) {
    throw new Error('云端拒绝写入（HTTP ' + Number(res && res.statusCode) + '）')
  }
  const backup = parseRemoteBackup(text) || {}
  rememberSync(backup.exportedAt)
  return { exportedAt: Number(backup.exportedAt) || 0, counts: countsOf(backup) }
}

/**
 * 拉取远端备份（只下载 + 校验，不动数据库）。
 * 失败一律返回 { ok:false, reason }，不抛错 —— 调用方常用它做"启动比对"。
 * @returns {Promise<{ok:boolean, backup?:object, exportedAt?:number, reason?:string}>}
 */
export async function fetchRemote() {
  const cfg = loadConfig()
  if (!isConfigured(cfg)) return { ok: false, reason: 'not-configured' }
  let res
  try {
    res = await request(buildGetOptions(cfg))
  } catch (e) {
    return { ok: false, reason: 'network' }
  }
  const code = Number(res && res.statusCode)
  if (code === 404) return { ok: false, reason: 'empty' }
  if (!httpOk(code)) return { ok: false, reason: 'http-' + code }
  const obj = parseRemoteBackup(res.data)
  if (!looksLikeBackup(obj)) return { ok: false, reason: 'not-backup' }
  return { ok: true, backup: obj, exportedAt: Number(obj.exportedAt) || 0, counts: countsOf(obj) }
}

/**
 * 从云端恢复：拉取 → 整库校验 → 整库替换。
 * 校验由 restoreBackup 内部做（复用同一套"，不合法就整份拒绝"的逻辑）。
 * @returns {Promise<object>} 恢复条数
 */
export async function restoreFromRemote() {
  const r = await fetchRemote()
  if (!r.ok) throw new Error(reasonText(r.reason))
  const counts = await restoreBackup(r.backup)
  rememberSync(r.exportedAt)
  return counts
}

/**
 * 启动比对：该查的时候查一次，比较云端与本机哪份更新。
 *
 * 返回的 action 由调用方决定怎么提示（页面弹窗 / 静默）：
 * - 'remote-newer' 云端更新 → 可以引导恢复
 * - 'local-newer'  云端比本机上次同步还旧（本机可能又记了账）→ 可以引导上传
 * - 'same' / 'none' 无需处理
 *
 * 节流标记在**发起请求前**写：连不上时也不要每次开 App 都卡一下网络超时。
 *
 * @param {number} [nowTs] 当前时间（测试注入）
 */
export async function checkRemoteOnStart(nowTs) {
  if (!isReady()) return { checked: false, action: 'none', reason: 'not-configured' }
  const now = Number(nowTs == null ? Date.now() : nowTs)
  if (!shouldAutoBackup(Number(readRaw(CHECK_KEY)) || 0, now, CHECK_INTERVAL)) {
    return { checked: false, action: 'none', reason: 'throttled' }
  }
  writeRaw(CHECK_KEY, now)

  const r = await fetchRemote()
  if (!r.ok) return { checked: true, action: 'none', reason: r.reason }
  const action = compareTimestamps(r.exportedAt, lastSyncAt())
  return { checked: true, action: action, remoteTs: r.exportedAt, localTs: lastSyncAt(), counts: r.counts }
}
