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

/**
 * 带符号的紧凑写法：-1234567 → '-¥1.2万'。
 *
 * 为什么不直接用 compactYuan：它内部 Math.max(0, …) 会把负数钳成 ¥0，
 * 结余/剩余这类可能为负的金额必须走这里，否则超支的账本会显示成 ¥0。
 */
export function compactYuanSigned(cents) {
  const v = Number(cents) || 0
  return (v < 0 ? '-' : '') + compactYuan(Math.abs(v))
}

/**
 * 大号金额展示的统一算法（v2.3.19 首页余额卡的算法升级为全站共享）。
 * 返回 { text, size }；**text 不含 ¥** —— 页面模板已经写死了「¥{{ }}」前缀，
 * 这里再带一个会渲染成「¥¥1.2万」。
 *
 * 用在哪些地方：预算卡、账本卡、报告头图、我的页小卡 —— 凡是"一格就一个
 * 大数字"的地方都按这套走：位数少给完整格式，≥9 字符压紧凑 + 字号分档。
 */
export function bigAmount(cents) {
  const full = formatCents(cents)
  if (full.length >= COMPACT_FROM_LEN) {
    // 负数的 ¥ 跟在 - 号后面（'-¥1.2万'），所以剥 ¥ 要连符号一起匹配，
    // 只剥行首会把负数渲染成「¥¥-1.2万」
    const bare = compactYuanSigned(cents).replace(/^(-?)¥/, '$1')
    return { text: bare, size: amountSizeClass(bare) }
  }
  return { text: full, size: amountSizeClass(full) }
}

/**
 * 行内小字金额：句子或「¥X / ¥Y」配对里的金额（预算卡"已花/还能花"、
 * 我的页攒钱目标这类）。只返回裸文本，¥ 由模板或拼接方自己写。
 *
 * 阈值与 bigAmount 相同（≥9 字符压紧凑）：这些位置字号小但同伴多，
 * 一侧变长会把同行的分类名/标签挤没，见 rowAmount 的对比。
 */
export function inlineAmount(cents) {
  return bigAmount(cents).text
}

/** 超过这个字符数（不含符号与 ¥），流水行金额才换紧凑写法 */
export const ROW_COMPACT_FROM_LEN = 13

/**
 * 流水行金额：'-¥19.90' / '+¥19.90' / '¥19.90'（type 传 'expense'/'income'/其他）。
 *
 * 和 bigAmount 阈值不同的原因：流水行有整行宽度（约 340px），15px 字号下
 * 12 字符（¥999,999.99 以内）在系统最大字体缩放里也放得下，日常金额
 * 保留两位小数完整精度；≥¥1000 万才压紧凑，防止把同行的分类名挤没。
 */
export function rowAmount(cents, type) {
  const sign = type === 'expense' ? '-' : type === 'income' ? '+' : ''
  const full = formatCents(cents)
  if (full.length < ROW_COMPACT_FROM_LEN) return sign + '¥' + full
  return sign + compactYuan(cents)
}
