/**
 * 应用内更新检查（配合 GitHub Releases 分发模式）。
 *
 * 工作方式：
 * - 请求 GitHub Releases latest，拿 tag_name 与当前版本（plus.runtime.version）比较
 * - 有新版 → 返回 { hasUpdate: true, tag, url }，由调用方弹窗引导去浏览器下载
 * - 每 24h 最多自动检查一次（节流键存 uni storage）；也可从「关于」手动触发
 * - 无网络 / 超时 / H5 端全部静默失败——检查更新是锦上添花，绝不能打扰使用
 */
import {
  isNewerVersion, stripReleaseNotes, pickUpdateAssets, parseWgtSha256, buildWgtSources,
  WGT_ASSET_PREFIX
} from '../utils/update.js'
import { sha256Hex, base64ToBytes } from '../utils/sha256.js'

const UPDATE_LAST_KEY = 'cashDiary.updateCheck.lastAt'
const CHECK_INTERVAL = 24 * 60 * 60 * 1000
const RELEASE_API = 'https://api.github.com/repos/dpoy-zht/cash-diary/releases/latest'
const RELEASE_PAGE = 'https://github.com/dpoy-zht/cash-diary/releases/latest'


/**
 * 当前 App 版本名。
 * 优先级：appWgtVersion（当前资源包版本，wgt 热更后立即变新）→ appVersion（APK 版本）
 * → plus.runtime.version（兜底，热更后不会变，只作最后回退）。
 * 用 appWgtVersion 对比版本是为了防循环：热更后 plus.runtime.version 还是旧值，
 * 会一直提示「发现新版本 v2.2.1」反复下载同一个 wgt。
 */
export function currentAppVersion() {
  try {
    if (typeof uni !== 'undefined' && uni.getAppBaseInfo) {
      const info = uni.getAppBaseInfo() || {}
      const v = String(info.appWgtVersion || info.appVersion || '').trim()
      if (v) return v
    }
  } catch (e) { /* 降级到 plus */ }
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
        /**
         * 超时给 30s 而不是 10s：GitHub API 在国内访问延迟波动大，
         * 10s 经常在慢网下直接超时 —— 那样亲友点「检查更新」永远只会看到
         * 「网络不可用」，功能等于没有。宁可多等一会儿也要拿到结果。
         */
        timeout: 30000,
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
      wgtSha256: parseWgtSha256(res && res.body),
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

/**
 * 下载 wgt 到本地临时目录。
 *
 * 为什么用 `plus.downloader` 而不是 `uni.downloadFile`（2026-10-06 真机实测）：
 * GitHub 的 Release 资产会 **302 重定向**到 `release-assets.githubusercontent.com`。
 * 实测手机 curl 直连完全正常（HTTP 200 / 560 KB / 7.3s），但 `uni.downloadFile`
 * 在 App 端对这种跨域重定向的表现不稳定，会直接 fail —— 于是热更永远失败，
 * 表现成"点了没反应"。
 * `plus.downloader` 是 DCloud 原生下载器，**跟随重定向、支持进度与取消**，
 * 是官方推荐的热更下载方式。
 *
 * @param {string} url wgt 直链
 * @returns {Promise<string>} 本地绝对路径
 */
function downloadFile(url) {
  return new Promise(function (resolve, reject) {
    // 单源 25s：代理实测 4~6 秒下完 572KB，25s 足够；两个源最坏 50s 就结束。
    // 不能再长 —— 直连那种随机断流会让人干等，这就是'每次都要等很久'的由来。
    const timeoutMs = 25000
    const timer = setTimeout(function () {
      try { d.abort() } catch (e) { /* 忽略 */ }
      reject(new Error('下载超时'))
    }, timeoutMs)

    const d = plus.downloader.createDownload(
      url, // 跨域重定向由原生层处理
      // ⚠️ 路径写法必须是 `_doc/update.wgt`（**单斜杠**），不能写 `_doc://update.wgt`。
      // 2026-10-06 真机踩过：双斜杠会被 plus 解析成 `_doc:` 这个"目录名"，
      // 结果落到磁盘上一个名为 `:` 的畸形目录里（真机证据：doc/:/update.wgt），
      // 下载其实成功了（572,659 B 与线上一致），但后续 install 找不到文件 →
      // 表现为"一直加载中然后更新失败"。
      { filename: '_doc/update.wgt', timeout: timeoutMs },
      function (download, status) {
        clearTimeout(timer)
        // status: 0=待开始 1=下载中 2=完成 3=失败 4=取消
        if (status === 2) {
          // plus.downloader 返回的 filename 可能是相对路径（如 "_doc/update.wgt"），
          // 必须转成绝对路径才能交给 install。转换失败再走一次 resolve 兜底 ——
          // 这两步任何一步出错，用户看到的就是"更新失败"，所以都要有退路。
          let abs
          try {
            abs = plus.io.convertLocalFileSystemURL(download.filename)
          } catch (e) { abs = '' }
          if (!abs) {
            try {
              plus.io.resolveLocalFileSystemURL(
                download.filename,
                function (entry) { resolve(entry.fullPath) },
                function () { reject(new Error('下载完成但找不到文件')) }
              )
              return
            } catch (e2) {
              reject(new Error('下载完成但路径解析失败'))
              return
            }
          }
          resolve(abs)
        } else if (status === 3) {
          reject(new Error('下载失败（HTTP ' + download.statusCode + '）'))
        } else {
          reject(new Error('下载未完成'))
        }
      }
    )
    d.start()
  })
}

/** 读本地临时文件（App 端）：readAsDataURL 拿到 base64，交给纯函数解码与哈希 */
function readTempFileDataUrl(path) {
  return new Promise(function (resolve, reject) {
    try {
      plus.io.resolveLocalFileSystemURL(
        path,
        function (entry) {
          entry.file(
            function (file) {
              const reader = new plus.io.FileReader()
              reader.onload = function (e) { resolve(String(e.target.result || '')) }
              reader.onerror = function () { reject(new Error('读取更新包失败')) }
              reader.readAsDataURL(file)
            },
            function () { reject(new Error('读取更新包失败')) }
          )
        },
        function () { reject(new Error('读取更新包失败')) }
      )
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * 校验下载到的 wgt 文件哈希（T2.5）。
 * 读不出来 / 算不出来一律视为校验失败（fail closed）：无法证明完整的东西绝不装。
 */
export async function verifyWgtFileHash(tempPath, expectedHex) {
  try {
    const dataUrl = await readTempFileDataUrl(tempPath)
    const hex = sha256Hex(base64ToBytes(dataUrl))
    return hex === String(expectedHex || '').toLowerCase()
  } catch (e) {
    return false
  }
}

/** plus.runtime.install 包装：失败 resolve false，不抛错 */
function installWgt(tempFilePath) {
  return new Promise(function (resolve) {
    plus.runtime.install(
      tempFilePath,
      { force: false },
      function () { resolve(true) },
      function (err) {
        // 把失败原因打出来：install 失败可能是版本没变、文件损坏、路径不对，
        // 不打日志就只能靠猜（2026-10-06 就在这上面绕了很久）
        console.error('[update] install 失败：', (err && err.message) || err)
        resolve(false)
      }
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

  // 1) 有 wgt：逐个源尝试下载 → 哈希校验（Release 说明带 wgt-sha256 时）→ 安装；
  //    全部源都失败 → 回退整包
  if (r.wgtUrl) {
    // 每个源单独给一次机会（单源 45s 足够572KB 的包），全部失败才放弃
    const sources = buildWgtSources(r.wgtUrl)
    for (let i = 0; i < sources.length; i++) {
      const url = sources[i]
      const isLast = i === sources.length - 1
      try {
        const temp = await downloadFile(url)
        if (r.wgtSha256) {
          const hashOk = await verifyWgtFileHash(temp, r.wgtSha256)
          if (!hashOk) {
            // 校验失败说明这个源给的包不对（损坏/被劫持），换下一个源也没意义 → 直接中止
            return { ok: false, type: 'wgt', reason: 'hash-mismatch' }
          }
        }
        const installed = await installWgt(temp)
        if (installed) return { ok: true, type: 'wgt', source: url }
        return { ok: false, type: 'wgt', reason: 'install-failed' }
      } catch (e) {
        console.error('[update] 源 ' + (i + 1) + '/' + sources.length + ' 失败：',
          (e && e.message) || e)
        // 还有下一个源就继续试，全挂了才落到整包回退
        if (!isLast) continue
        return { ok: false, type: 'wgt', reason: 'download-failed', error: (e && e.message) || '' }
      }
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
          title: u.reason === 'open-failed' ? '浏览器打开失败，请到项目主页手动下载'
            : u.reason === 'hash-mismatch' ? '更新包校验失败，请通过整包安装'
            : '更新失败，稍后再试',
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
