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
