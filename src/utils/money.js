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

/**
 * 金额"区间端点"输入 → 整数分；空 / 非法 → null（表示该侧不限）。
 *
 * 与 parseAmountToCents 的区别：**允许 0**（金额区间下界写 0 是合理的），
 * 且不校验"必须大于 0"。规则与它保持一致（最多 2 位小数、最多 9 位整数）。
 */
export function parseAmountBound(str) {
  const s = String(str === null || str === undefined ? '' : str).trim()
  if (!s) return null
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null
  return Math.round(parseFloat(s) * 100)
}

/**
 * 整数千分位分组：1234567 → '1,234,567'。
 *
 * **为什么不用 `toLocaleString`**：Android 上 uni-app 的 app-service JS 引擎没有 Intl
 * （真机实测 `typeof Intl === 'undefined'`），`toLocaleString(locale, options)` 会把
 * options 整个丢掉 —— `(1800).toLocaleString('zh-CN', {minimumFractionDigits:2})`
 * 真机返回 '1800' 而不是 '1,800.00'。金额展示因此丢千分位、丢两位小数：
 * 首页实际渲染成「已花 ¥1800」，与设计稿的 ¥1,800.00 不符。
 * H5 有完整 ICU，所以这个问题在浏览器预览里根本看不出来，只在真机出现。
 */
export function groupThousands(n) {
  const s = String(Math.trunc(Math.abs(Number(n) || 0)))
  let out = ''
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ','
    out += s.charAt(i)
  }
  return out
}

/** 1990 → '19.90'；180000 → '1,800.00'（千分位 + 两位小数；实现不依赖 Intl） */
export function formatCents(cents) {
  const v = Number(cents)
  const neg = isFinite(v) && v < 0
  const fen = Math.round(Math.abs(isFinite(v) ? v : 0))
  return (neg ? '-' : '') + groupThousands(Math.floor(fen / 100)) + '.' + String(fen % 100).padStart(2, '0')
}

/** (1990, 'expense') → '-¥19.90'；中国习惯：红支绿收，符号带正负 */
export function formatSigned(cents, type) {
  const sign = type === 'expense' ? '-' : '+'
  return sign + '¥' + formatCents(cents)
}

/** 记账页大数字展示：'1990' → '1,990'；'19.9' → '19.9'（千分位同样手写，理由见 groupThousands） */
export function displayAmount(str) {
  if (!str) return '0.00'
  const parts = str.split('.')
  const intPart = parts[0] ? groupThousands(parts[0]) : '0'
  return parts.length > 1 ? intPart + '.' + parts[1] : intPart
}

/**
 * 金额紧凑写法：0 → ¥0；< 1 万 → ¥1,234；≥ 1 万 → ¥1.8万。
 *
 * 什么时候必须用它：首页余额卡的「已花」是 28px 大数字，
 * 而那一列在 360dp 窄屏 + 系统大字体下只有一百多 px 可用，
 * `¥12,345.67` 这种 10 字符会被 CSS 截成 `¥12,345…`（用户真机截图实测）。
 * 压到 6 个字符以内是唯一稳的办法 —— 改字号挡不住系统字体缩放。
 */
export function compactYuan(cents) {
  const c = Math.max(0, Number(cents) || 0)
  if (!c) return '¥0'
  const yuan = c / 100
  if (yuan < 10000) return '¥' + groupThousands(Math.round(yuan))
  return '¥' + (yuan / 10000).toFixed(1) + '万'
}

/** 超过这个字符数就改用 compactYuan（10 字符 = ¥12,345.67，再长就没法看了） */
export const COMPACT_FROM_LEN = 9

/**
 * 大号金额的字号档位（纯函数，可单测）。
 *
 * ⚠️ **为什么不能只靠字号分档解决**：OriginOS / vivo 的「系统字体大小」会把
 * WebView 文本整体放大（实测列宽 108px 时 7 字符就要 104px，字号一放大必截断）。
 * 字号降档只能扛住一部分缩放，所以 `home.vue` 是**两件事一起做**：
 * ① 超过 9 字符改用 compactYuan（把字符数压下来，缩放也扛得住）
 * ② 剩下的按字符数降一档字号。
 *
 * @param {string} text 已格式化好的金额（不含 ¥）
 * @returns {string} ''（默认）/ 'md' / 'sm'，对应 CSS 里的字号档
 */
export function amountSizeClass(text) {
  const n = String(text == null ? '' : text).length
  if (n <= 6) return ''
  if (n <= 8) return 'md'
  return 'sm'
}
