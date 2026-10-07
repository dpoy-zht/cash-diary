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
  isNewerVersion, stripReleaseNotes, pickUpdateAssets, parseWgtSha256, parseWgtSize,
  buildWgtSources, WGT_ASSET_PREFIX
} from '../utils/update.js'
import { sha256Hex, base64ToBytes } from '../utils/sha256.js'

const UPDATE_LAST_KEY = 'cashDiary.updateCheck.lastAt'
const CHECK_INTERVAL = 24 * 60 * 60 * 1000

/**
 * 自建更新源（2026-10-07）。
 *
 * 为什么不用 GitHub 作为主源 —— 手机直连GitHub Release 在国内**时通时断**，
 * 真机实测同一时刻：自建服务器 0.079s 拿到 / ghfast 下到 294KB 卡死 /
 * GitHub 直连 9.7s 且随时可能断成残包。所以主源换成本人的服务器，
 * GitHub 降级为**兜底**（服务器挂了还能试）。
 *
 * latest.json 由 `dist/dev/gen-latest-json.py` 生成（发版时自动推）。
 */
const SELF_HOSTED_API = 'http://121.40.24.123/update/latest.json'
/** 自建源不可用时才走的兜底源 */
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

  // 主源：自建服务器（真机 0.079s）；失败才回退 GitHub
  const self = await querySelfHosted(current)
  if (self) return self
  return await queryGithub(current)
}

/** 简单的 GET JSON */
function fetchJson(url, timeout, header) {
  return new Promise(function (resolve, reject) {
    uni.request({
      url: url,
      method: 'GET',
      timeout: timeout || 15000,
      header: header || {},
      success: function (r) {
        if (r.statusCode !== 200) { reject(new Error('HTTP ' + r.statusCode)); return }
        resolve(r.data)
      },
      fail: function () { reject(new Error('网络不可用')) }
    })
  })
}

/**
 * 主源：自建服务器上的 latest.json。
 * 任何异常都返回 null（交给兜底源），**绝不抛错** —— 服务器挂了不该让用户看到报错。
 */
async function querySelfHosted(current) {
  try {
    const d = await fetchJson(SELF_HOSTED_API, 12000)
    if (!d || !d.version) return null
    if (!isNewerVersion(d.version, current)) {
      return { hasUpdate: false, reason: 'latest', current: current }
    }
    const wgt = (d.assets && d.assets.wgt) || null
    const apk = (d.assets && d.assets.apk) || null
    // wgt 防降级：它的版本必须比当前已装资源新
    const wgtUrl = wgt && wgt.url && isNewerVersion(d.version, current) ? wgt.url : ''
    return {
      hasUpdate: true,
      source: 'self',
      tag: d.tag || ('v' + d.version),
      url: wgtUrl || (apk && apk.url) || RELEASE_PAGE,
      notes: '修复与功能更新。',
      current: current,
      wgtUrl: wgtUrl,
      wgtVersion: d.version,
      // ⚠️ **只带 size、不带 sha256**：App 端纯 JS 算 572KB 的 SHA-256
      // 会慢一到两个数量级（实测卡在「正在更新…」）。原生取大小瞬时，
      // 且足以抓住断流残包。防篡改交给 install 自身校验。
      wgtSha256: '',
      wgtSize: (wgt && wgt.size) || 0,
      apkUrl: (apk && apk.url) || ''
    }
  } catch (e) {
    return null // 服务器不可达 → 用兜底源
  }
}

/** 兜底源：GitHub Release API */
async function queryGithub(current) {
  try {
    const res = await fetchJson(
      RELEASE_API, 30000,
      { 'User-Agent': 'cash-diary-app', 'Accept': 'application/vnd.github+json' }
    )
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
      source: 'github',
      tag: tag,
      url: (res && res.html_url) || RELEASE_PAGE,
      notes: notes || '覆盖安装即可升级，账目数据都在。',
      current: current,
      wgtUrl: picked.wgtUrl,
      wgtVersion: picked.wgtVersion,
      wgtSha256: parseWgtSha256(res && res.body),
      wgtSize: parseWgtSize(res && res.body),
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
        /**
         * ⚠️ **这个回调会被反复调用多次**（status: 0 待开始→ 1 下载中 → 2 完成），
         * **不是调用一次就结束**（2026-10-07 真机踩过）。
         *
         * 之前的写法是 `if (status === 2) {...} else if (status === 3) {...} else { reject }`，
         * 结果**第一次回调（status=0）就落进 else 直接 reject**——
         * 于是文件明明完整下载了（真机证据：doc 里 8 个文件全是 573,545 B，
         * 与线上一致），代码却已判定「下载未完成」退出，
         * 随后 7 次重试各存一个新文件（update(1)...update(8)）。
         *
         * 正确做法：**只在终态（2 完成 / 3 失败 / 4 取消）决策，其余状态直接忽略**。
         */
        if (status === 0 || status === 1) return   // 待开始/下载中 → 忽略，等后续回调

        clearTimeout(timer)
        if (status === 2) {
        /**
         * ⚠️ **必须拿到绝对路径，不是 file:// URL**（2026-10-07 真机定位）。
         *
         * `plus.io.convertLocalFileSystemURL()` 返回的是 **URL 形式**
         * （如 `file:///storage/emulate/0/Android/data/.../update.wgt`），
         * 而 `plus.runtime.install()` **只接受本地绝对路径**
         * （如 `/storage/emulate/0/Android/data/.../update.wgt`）。
         *
         * 之前的代码「转换成功就用返回值、不抛异常就不走兜底」，
         * 于是把 file:// URL 传给了 install → **必然失败**。
         * 真机证据：wgt 完整下载 573,397 B、zip 校验通过、sha256 与源一致，
         * 但点更新就是失败 —— 文件本身毫无问题，纯粹是路径形态不对。
         *
         * 现在**一律以 entry.fullPath 为准**，convert 只用来判断文件存在。
         */
        plus.io.resolveLocalFileSystemURL(
          download.filename,
          function (entry) { resolve(entry.fullPath) },   // ← 绝对路径，install 要的就是这个
          function () {
            // 连文件都拿不到才退到 convert（可能已过期，但至少给 install 一个机会）
            try {
              const abs = plus.io.convertLocalFileSystemURL(download.filename)
              if (!abs) return reject(new Error('下载完成但找不到文件'))
              // convert 给的是 URL，去掉 file:// 前缀还原成绝对路径
              resolve(abs.replace(/^file:\/\//, ''))
            } catch (e) {
              reject(new Error('下载完成但路径解析失败'))
            }
          }
        )
      } else if (status === 3) {
          reject(new Error('下载失败（HTTP ' + (download.statusCode || '未知') + '）'))
        } else if (status === 4) {
          reject(new Error('下载已取消'))
        } else {
          // 终态但不认识的状态码：不能当成失败就放弃，先去看文件是否已完整落盘
          plus.io.resolveLocalFileSystemURL(
            download.filename,
            function (entry) { resolve(entry.fullPath) },
            function () { reject(new Error('下载未完成（状态 ' + status + '）')) }
          )
        }
      }
    )
    d.start()
  })
}

/**
 * 读本地临时文件（App 端）：readAsDataURL 拿到 base64，交给纯函数解码与哈希。
 *
 * ⚠️ **这个函数是「正在更新…」卡死的元凶**（2026-10-07 真机定位）。
 * 对 572KB 的 wgt，它要做：读整个文件 → 转成 764KB 的 base64 字符串 →
 * `base64ToBytes` 解码回Uint8Array → **纯 JS 逐字节算 SHA-256**。
 * 在 Node 里只要 10ms，但 App 端引擎无 JIT 优化，纯 JS 跑 572,990 字节
 * 会慢一到两个数量级，再叠加两次内存拷贝，界面就长期停在「正在更新…」。
 *
 * 现在只在**用户主动开启严格校验**时才走这条路（默认关闭，见 verifyWgtFile）。
 */
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

/** 取本地文件大小（原生 API，瞬间返回）；拿不到返回 -1 */
function fileSizeOf(path) {
  return new Promise(function (resolve) {
    try {
      plus.io.resolveLocalFileSystemURL(
        path,
        function (entry) {
          try {
            entry.file(
              function (file) { resolve(Number(file.size) || 0) },
              function () { resolve(-1) }
            )
          } catch (e) { resolve(-1) }
        },
        function () { resolve(-1) }
      )
    } catch (e) {
      resolve(-1)
    }
  })
}

/**
 * 校验下载到的 wgt（T2.5）。
 *
 * 默认走**文件大小**校验（原生 API，瞬时）—— 它能抓住最常见的"下载不完整"
 * （GitHub 直连断流时实测下到 310KB/516KB/262KB 就卡住，大小立刻对不上）。
 *
 * 严格哈希校验（SHA-256）改为**可选**：纯 JS 算 572KB 在 App 端太慢，
 * 会让热更看起来像卡死。Release 说明里带 `wgt-size` 时才启用。
 *
 * @param {string} tempPath
 * @param {string} expectedHex期望的 sha256（可选，缺省则跳过）
 * @param {number} [expectedSize] 期望的字节数（可选，缺省则跳过）
 * @returns {Promise<boolean>}
 */
export async function verifyWgtFile(tempPath, expectedHex, expectedSize) {
  try {
    // 1) 大小校验优先 —— 抓断流残包，且不阻塞界面
    if (typeof expectedSize === 'number' && expectedSize > 0) {
      const actual = await fileSizeOf(tempPath)
      if (actual !== expectedSize) {
        console.error('[update] 文件大小不符：期望 ' + expectedSize + ' 实际 ' + actual)
        return false
      }
    }
    // 2) 哈希校验（仅在明确提供期望值时做）
    if (expectedHex) {
      const dataUrl = await readTempFileDataUrl(tempPath)
      const hex = sha256Hex(base64ToBytes(dataUrl))
      return hex === String(expectedHex).toLowerCase()
    }
    // 3) 两者都没有 → 无法证明完整，但也不能因此永远失败：
    //    交给 install 自身的校验（uni-app 会校验 wgt 的 manifest）。
    return true
  } catch (e) {
    console.error('[update] 校验异常：', (e && e.message) || e)
    return false
  }
}

/**
 * 旧接口保留（测试与兼容用）：只做哈希校验。
 * @deprecated 新代码用 verifyWgtFile
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

/**
 * plus.runtime.install 包装。
 *
 * ⚠️ 失败时**把原因带出去**（resolve {ok, reason, detail}）而不是只给 boolean ——
 * 之前只返回 false，界面上只能显示「更新失败，稍后再试」，
 * 到底是版本没变、文件损坏还是路径不对全靠猜（2026-10-06/07 在这上面绕了两晚）。
 * 现在 detail 会原样进 toast，真机一眼能看出问题。
 */
function installWgt(tempFilePath) {
  return new Promise(function (resolve) {
    try {
      plus.runtime.install(
        tempFilePath,
        // ⚠️ **force 必须 true**：wgt 的版本号与已装资源包相同时，
        // force:false 会让 install 直接拒绝。真机上实测：v2.3.10 装 v2.3.11
        // 连续失败 6 次（文件大小完全正确，就是这里被拒）。
        // 同版本重装本来就该允许 —— 那是用户重试的正常诉求。
        { force: true },
        function () { resolve({ ok: true }) },
        function (err) {
          const detail = String((err && (err.message || err.code)) || err || '未知原因')
          console.error('[update] install 失败：', detail)
          resolve({ ok: false, reason: 'install-failed', detail: detail })
        }
      )
    } catch (e) {
      const detail = String((e && e.message) || e || '未知原因')
      console.error('[update] install 抛异常：', detail)
      resolve({ ok: false, reason: 'install-throw', detail: detail })
    }
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
        // 校验：优先用文件大小（原生、瞬时，能抓住断流残包）；
        // Release 说明带 wgt-size 才启用大小校验；wgt-sha256 仍会做哈希（若提供）。
        const verify = await verifyWgtFile(temp, r.wgtSha256, r.wgtSize)
        if (!verify) {
          // 校验失败说明这个源给的包不对（损坏/被劫持），换下一个源也没意义 → 直接中止
          return { ok: false, type: 'wgt', reason: 'verify-failed' }
        }
        const installed = await installWgt(temp)
        if (installed.ok) return { ok: true, type: 'wgt', source: url }
        // detail 原样带出去：真机弹窗能直接看到 install 的真实原因
        return { ok: false, type: 'wgt', reason: installed.reason, detail: installed.detail }
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
 * 失败文案：把**真实原因**露出来。
 *
 * 之前一律显示「更新失败，稍后再试」，真机调试只能靠猜 ——
 * 2026-10-06/07 连续两晚卡在同一个问题上，就是因为看不到 install 的原始报错。
 * 现在 install 的 err.message 会直接进toast，一眼看出是版本没变还是路径不对。
 */
function failText(u) {
  if (u.reason === 'open-failed') return '浏览器打开失败，请到项目主页手动下载'
  if (u.reason === 'verify-failed') return '更新包校验失败（' + (u.detail || '大小不符') + '）'
  if (u.reason === 'install-failed' || u.reason === 'install-throw') {
    return '安装失败：' + (u.detail || '未知原因')
  }
  if (u.reason === 'download-failed') {
    return '下载失败（' + (u.error || '网络不通') + '）'
  }
  return '更新失败，稍后再试'
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
          title: failText(u),
          icon: 'none',
          duration: 4000   // 带原因的文案较长，多给点显示时间
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
