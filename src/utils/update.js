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
