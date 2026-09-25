/**
 * 金额工具 —— 全工程唯一允许做"分 ↔ 元"换算的地方。
 * 铁律：存储一律整数分（1990 = ¥19.90），禁止浮点数参与存储与计算。
 */

/** '19.9' → 1990；非法输入返回 null（空串、非数字、>2 位小数、0、超 9 位整数） */
export function parseAmountToCents(str) {
  if (typeof str !== 'string') return null
  const s = str.trim()
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null
  const cents = Math.round(parseFloat(s) * 100)
  return cents > 0 ? cents : null
}

/** 1990 → '19.90'；180000 → '1,800.00'（千分位 + 两位小数） */
export function formatCents(cents) {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** (1990, 'expense') → '-¥19.90'；中国习惯：红支绿收，符号带正负 */
export function formatSigned(cents, type) {
  const sign = type === 'expense' ? '-' : '+'
  return sign + '¥' + formatCents(cents)
}

/** 键盘输入状态机（纯函数）：返回新字符串，非法输入返回原值 */
export function keypadInput(current, key) {
  if (key === 'del') return current.slice(0, -1)
  if (key === '.') {
    if (current.indexOf('.') !== -1) return current
    return current ? current + '.' : '0.'
  }
  const parts = current.split('.')
  if (parts.length === 2 && parts[1].length >= 2) return current // 小数最多 2 位
  if (parts[0].replace(/^0+/, '').length >= 9) return current // 整数最多 9 位
  return current + key
}

/** 记账页大数字展示：'1990' → '1,990'；'19.9' → '19.9' */
export function displayAmount(str) {
  if (!str) return '0.00'
  const parts = str.split('.')
  const intPart = parts[0] ? Number(parts[0]).toLocaleString('zh-CN') : '0'
  return parts.length > 1 ? intPart + '.' + parts[1] : intPart
}
