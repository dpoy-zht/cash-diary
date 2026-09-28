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
