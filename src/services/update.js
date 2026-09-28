/**
 * 应用内更新检查（配合 GitHub Releases 分发模式）。
 *
 * 工作方式：
 * - 请求 GitHub Releases latest，拿 tag_name 与当前版本（plus.runtime.version）比较
 * - 有新版 → 返回 { hasUpdate: true, tag, url }，由调用方弹窗引导去浏览器下载
 * - 每 24h 最多自动检查一次（节流键存 uni storage）；也可从「关于」手动触发
 * - 无网络 / 超时 / H5 端全部静默失败——检查更新是锦上添花，绝不能打扰使用
 */
import { isNewerVersion } from '../utils/update.js'

const UPDATE_LAST_KEY = 'cashDiary.updateCheck.lastAt'
const CHECK_INTERVAL = 24 * 60 * 60 * 1000
const RELEASE_API = 'https://api.github.com/repos/dpoy-zht/cash-diary/releases/latest'
const RELEASE_PAGE = 'https://github.com/dpoy-zht/cash-diary/releases/latest'

/** 当前 App 版本名（App 端读 plus.runtime.version；H5 无此能力返回空串） */
export function currentAppVersion() {
  try {
    if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.version) {
      return String(plus.runtime.version)
    }
  } catch (e) { /* H5 / 测试环境 */ }
  return ''
}

function throttleOk(now) {
  try {
    const last = Number(uni.getStorageSync(UPDATE_LAST_KEY)) || 0
    if (now - last < CHECK_INTERVAL) return false
    uni.setStorageSync(UPDATE_LAST_KEY, now)
    return true
  } catch (e) {
    return true // 存储不可用时每次都查一次，问题不大
  }
}

/**
 * 检查更新（自动 / 手动共用）。
 * @param {object} [opts] { force: boolean } 手动触发时跳过节流
 * @returns {Promise<{hasUpdate:boolean, tag?:string, url?:string, reason?:string}>}
 */
export async function checkForUpdate(opts) {
  const now = Date.now()
  if (!(opts && opts.force) && !throttleOk(now)) {
    return { hasUpdate: false, reason: 'throttled' }
  }
  const current = currentAppVersion()
  if (!current) return { hasUpdate: false, reason: 'not-app' }

  try {
    const res = await new Promise(function (resolve, reject) {
      uni.request({
        url: RELEASE_API,
        method: 'GET',
        timeout: 10000,
        header: { 'User-Agent': 'cash-diary-app', 'Accept': 'application/vnd.github+json' },
        success: function (r) {
          if (r.statusCode !== 200) { reject(new Error('HTTP ' + r.statusCode)); return }
          resolve(r.data)
        },
        fail: function () { reject(new Error('网络不可用')) }
      })
    })
    const tag = res && res.tag_name
    if (!isNewerVersion(tag, current)) return { hasUpdate: false, reason: 'latest' }
    return { hasUpdate: true, tag: tag, url: (res && res.html_url) || RELEASE_PAGE }
  } catch (e) {
    return { hasUpdate: false, reason: 'offline' }
  }
}

/** 用系统浏览器打开 Releases 页面下载新包（App 端） */
export function openReleasePage(url) {
  try {
    if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.openURL) {
      plus.runtime.openURL(url || RELEASE_PAGE)
      return true
    }
  } catch (e) { /* H5 无此能力 */ }
  return false
}
