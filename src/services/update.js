/**
 * 应用内更新检查（配合 GitHub Releases 分发模式）。
 *
 * 工作方式：
 * - 请求 GitHub Releases latest，拿 tag_name 与当前版本（plus.runtime.version）比较
 * - 有新版 → 返回 { hasUpdate: true, tag, url }，由调用方弹窗引导去浏览器下载
 * - 每 24h 最多自动检查一次（节流键存 uni storage）；也可从「关于」手动触发
 * - 无网络 / 超时 / H5 端全部静默失败——检查更新是锦上添花，绝不能打扰使用
 */
import { isNewerVersion, stripReleaseNotes, pickUpdateAssets, WGT_ASSET_PREFIX } from '../utils/update.js'

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
    const notes = stripReleaseNotes(res && res.body, 120)
    if (!isNewerVersion(tag, current)) {
      return { hasUpdate: false, reason: 'latest', current: current }
    }
    // 解析资产：有 .wgt = 纯前端更新走热更；只有 .apk = 原生变更走整包
    const picked = pickUpdateAssets(res && res.assets, WGT_ASSET_PREFIX)
    // wgt 防降级：wgt 版本必须比当前已装资源新才值得热更
    if (picked.wgtUrl && !isNewerVersion(picked.wgtVersion, current)) {
      picked.wgtUrl = ''
    }
    return {
      hasUpdate: true,
      tag: tag,
      url: (res && res.html_url) || RELEASE_PAGE,
      notes: notes || '覆盖安装即可升级，账目数据都在。',
      current: current,
      wgtUrl: picked.wgtUrl,
      wgtVersion: picked.wgtVersion,
      apkUrl: picked.apkUrl
    }
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


/* ---------------- wgt 热更新执行引擎（App 端） ---------------- */

/** uni.downloadFile 包装成 Promise，手动加 90s 超时（大文件慢网兜底） */
function downloadFile(url) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () { reject(new Error('下载超时')) }, 90000)
    uni.downloadFile({
      url: url,
      success: function (r) {
        clearTimeout(timer)
        if (r.statusCode === 200) resolve(r.tempFilePath)
        else reject(new Error('下载失败 HTTP ' + r.statusCode))
      },
      fail: function () {
        clearTimeout(timer)
        reject(new Error('下载失败，请检查网络'))
      }
    })
  })
}

/** plus.runtime.install 包装：失败 resolve false，不抛错 */
function installWgt(tempFilePath) {
  return new Promise(function (resolve) {
    plus.runtime.install(
      tempFilePath,
      { force: false },
      function () { resolve(true) },
      function () { resolve(false) }
    )
  })
}

/** 重启 App 使 wgt 生效（App 端；其他端 no-op） */
export function restartApp() {
  try {
    if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.restart) {
      plus.runtime.restart()
      return true
    }
  } catch (e) { /* 静默 */ }
  return false
}

/**
 * 执行更新：优先 wgt 热更（下载 → 安装，重启后生效）；
 * 没有 wgt 或热更失败 → 回退打开下载页走整包。
 * 仅 App 端执行；H5 / 测试环境返回 not-app。
 *
 * @param {{wgtUrl?:string, wgtVersion?:string, url?:string}} r checkForUpdate 的结果
 * @returns {Promise<{ok:boolean, type?:'wgt'|'apk', reason?:string, error?:string}>}
 */
export async function applyUpdate(r) {
  if (typeof plus === 'undefined' || !plus.runtime) return { ok: false, reason: 'not-app' }
  if (!r || (!r.wgtUrl && !r.url)) return { ok: false, reason: 'no-target' }

  // 1) 有 wgt：静默下载安装（安装失败回退整包）
  if (r.wgtUrl) {
    try {
      const temp = await downloadFile(r.wgtUrl)
      const ok = await installWgt(temp)
      if (ok) return { ok: true, type: 'wgt' }
    } catch (e) {
      // 下载/安装失败，落到下面的整包回退
    }
  }

  // 2) 回退：打开下载页走整包
  const opened = openReleasePage(r.url)
  return { ok: opened, type: 'apk', reason: opened ? undefined : 'open-failed' }
}

/**
 * 统一更新交互：确认更新后调用。
 * loading 遮罩 → applyUpdate → wgt 成功提示重启 / apk 成功提示去浏览器 / 失败按原因 toast。
 * 所有路径 hideLoading，异常内部消化。
 */
export function updateNow(r) {
  uni.showLoading({ title: '正在更新…', mask: true })
  return applyUpdate(r)
    .then(function (u) {
      uni.hideLoading()
      if (u.ok && u.type === 'wgt') {
        uni.showModal({
          title: '更新完成',
          content: '新版本已就绪，重启应用生效～',
          showCancel: false,
          confirmText: '立即重启',
          success: function (r2) {
            if (r2.confirm) restartApp()
          }
        })
        return u
      }
      if (!u.ok) {
        uni.showToast({
          title: u.reason === 'open-failed' ? '浏览器打开失败，请到项目主页手动下载' : '更新失败，稍后再试',
          icon: 'none'
        })
        return u
      }
      uni.showToast({ title: '已打开下载页，安装即可', icon: 'none' }) // apk 整包回退
      return u
    })
    .catch(function () {
      uni.hideLoading()
      uni.showToast({ title: '更新失败，稍后再试', icon: 'none' })
      return { ok: false }
    })
}
