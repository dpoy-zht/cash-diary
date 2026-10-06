/**
 * 版本号比较（纯函数，应用内更新检查用）。
 *
 * 支持带或不带 v 前缀：'v2.1.0' / '2.1.0' → [2, 1, 0]。
 * 位数不齐时短边补 0（'2.0' 视作 '2.0.0'）；非数字段一律按 0 处理。
 */

/** 'v2.1.0' → [2, 1, 0] */
export function parseTagVersion(tag) {
  const parts = String(tag == null ? '' : tag).trim().replace(/^v/i, '').split('.')
  const out = [0, 0, 0]
  for (let i = 0; i < Math.max(3, parts.length); i += 1) {
    const n = parseInt(parts[i], 10)
    out[i] = Number.isFinite(n) && n > 0 ? n : 0
  }
  return out
}

/** latest 是否比 current 新；解析失败 / 相等 / 更旧都返回 false（宁可不提示，不误报） */
export function isNewerVersion(latestTag, currentVersion) {
  const a = parseTagVersion(latestTag)
  const b = parseTagVersion(currentVersion)
  if (!a.some(function (n) { return n > 0 }) || !b.some(function (n) { return n > 0 })) return false
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x !== y) return x > y
  }
  return false
}

/**
 * 把 GitHub Release 的 markdown 说明压成弹窗能放的纯文本。
 * 去 标题号、粗体斜体标记、列表符、分隔线、代码引号；链接保留文字；压掉多余空行后截断。
 * 纯函数可单测；空说明返回空串（调用方给兜底文案）。
 */
export function stripReleaseNotes(body, maxLen) {
  const limit = Math.max(20, Math.floor(Number(maxLen) || 120))
  const text = String(body == null ? '' : body)
    .split('\n')
    .map(function (line) {
      let l = line.trim()
      if (!l || /^(---|===|\*\*\*|-{3,})$/.test(l)) return '' // 分隔线整行去掉
      l = l.replace(/^#{1,6}\s*/, '') // 标题
      l = l.replace(/^\s*[-*+]\s+/, '· ') // 列表符
      l = l.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [文字](链接) → 文字
      l = l.replace(/[*_`~]/g, '') // 粗体/斜体/代码标记
      return l
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!text) return ''
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text
}

/* ---------------- wgt 热更新：资产解析（纯函数） ---------------- */

/** wgt 资产文件名的固定前缀（发版脚本约定，中文名会被 GitHub 消毒所以用英文） */
export const WGT_ASSET_PREFIX = 'nailong-ledger-v'

/**
 * 从 Release 说明里解析 wgt 的 SHA-256（发版约定行：`wgt-sha256: <64位hex>`）。
 * 没有该行返回空串 —— 旧版 Release 没带哈希，灰度期沿用"不校验"的旧逻辑；
 * 带了一定要验，验不过绝不安装。
 */
export function parseWgtSha256(body) {
  const m = /wgt[-_]sha256[:：=\s]+([0-9a-fA-F]{64})/.exec(String(body || ''))
  return m ? m[1].toLowerCase() : ''
}

/**
 * 从 wgt 文件名解析版本号：'nailong-ledger-v2.2.0.wgt' → 'v2.2.0'。
 * 不匹配返回空串。
 */
export function parseWgtVersionFromName(name, prefix) {
  const pre = String(prefix || WGT_ASSET_PREFIX)
  const n = String(name || '')
  if (n.indexOf(pre) !== 0 || n.slice(-4) !== '.wgt') return ''
  return n.slice(pre.length, -4)
}

/**
 * 从 Release 的 assets 里挑出更新所需资产（纯函数）。
 * 约定：有 .wgt 资产 = 纯前端更新（走热更）；只有 .apk = 原生变更（走整包）。
 * @param {Array} assets GitHub release assets
 * @param {string} [prefix] wgt 文件名前缀
 * @returns {{wgtUrl:string, wgtVersion:string, apkUrl:string}}
 */
export function pickUpdateAssets(assets, prefix) {
  const result = { wgtUrl: '', wgtVersion: '', apkUrl: '' }
  const list = Array.isArray(assets) ? assets : []
  for (const a of list) {
    const name = (a && a.name) || ''
    const url = a && (a.browser_download_url || a.url)
    if (!url) continue
    if (!result.wgtUrl && name.indexOf(String(prefix || WGT_ASSET_PREFIX)) === 0 && name.slice(-4) === '.wgt') {
      result.wgtUrl = url
      result.wgtVersion = parseWgtVersionFromName(name, prefix)
    } else if (!result.apkUrl && name.slice(-4) === '.apk') {
      result.apkUrl = url
    }
  }
  return result
}

/**
 * 由 GitHub 直链生成多个可用的下载源（**纯函数，可单测**）。
 *
 * 背景（2026-10-06 真机实测，小米 14 Pro，同一网络、同一时刻）：
 * ```
 * 直连 GitHub：Connected + SSL OK，但 "0 bytes received" 卡 25s 超时
 *   → 应用层限流/干扰：TCP 通、证书握手也成功，但服务端不返回数据
 * ghfast.top       ：HTTP 200 / 572,774 B / 3.4s ✓
 * cdn.jsdelivr.net  ：HTTP 200 / 1,111 B（代理仓库文件）/ 6.6s
 * ```
 * 所以「GitHub 直连」不是可靠的下载源 —— 它时好时坏（v2.2.8 那次直连 7.3s 成功，
 * v2.3.3 这次就超时）。**`dist/` 被 .gitignore，wgt 没进仓库**，
 * 所以 jsDelivr 那条对 Release 资产无效（它只能代理仓库里的文件），
 * 目前只有 `ghfast.top` 这条通用加速真的能拿到 wgt —— 它排在直连之后、原地址失败就顶上。
 *
 * @param {string} wgtUrl GitHub Release 资产直链
 * @returns {string[]} 按优先级排列的候选 URL（第一个是原地址：网络好时它最快）
 */
export function buildWgtSources(wgtUrl) {
  const raw = String(wgtUrl || '')
  if (!raw) return []
  // 只有 github.com 的链接才需要（也不应该）加代理
  if (raw.indexOf('github.com') === -1) return [raw]
  // ⚠️ **代理排第一，直连排最后**（2026-10-06 真机连续 4 次实测定案）。
  //
  // 直连 GitHub 不是"慢"，是**会在随机位置断流**，每次下到一半就卡死：
  // ```
  // 第 1 次：HTTP 200 但只下310,556 / 572,850 B，20s 超时
  // 第 2 次：HTTP 200 但只下 516,672 / 572,850 B，40s 超时
  // 第 3 次：HTTP 200 但只下 262,144 / 572,850 B（正好 256KB=2^18），15s 超时
  // ```
  // 无规律可循 → **延长超时毫无意义**，只会让用户干等（这正是"每次都要等很久
  // 还大概率失败"的由来）。而 ghfast.top 每次都是 4~6 秒完整下到。
  //
  // 直连保留在最后作兜底：万一代理挂了且当时网络好，还能试一次原始地址。
  return [
    'https://ghfast.top/' + raw,
    raw
  ]
}
