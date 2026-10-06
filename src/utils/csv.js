/**
 * 账单 CSV 导出（T4.2）—— 纯函数，全部可单测。不碰 uni / plus / 文件系统。
 *
 * 三个必须踩对的细节（Excel 很挑）：
 * 1. **UTF-8 BOM**：不加 BOM，Excel（Windows 中文版）会按 GBK 解码，中文全是乱码。
 *    这是"导出成功但用户打开是一堆问号"的头号原因。
 * 2. **转义**：单元格里出现逗号 / 双引号 / 换行时必须用双引号包裹，内部的双引号翻倍。
 *    备注是用户随手写的，`"` 和换行都真实存在（从备忘录粘贴进来的居多）。
 * 3. **换行用 CRLF**：Excel 对 LF 也能读，但老版本 Windows 记事本/Excel 对 CRLF 更稳。
 *
 * 另外做了一层**公式注入防护**：备注以 `=` `+` `@` 等开头时，Excel 会当公式执行
 * （CSV injection）。这里给这类单元格前置一个单引号。注意**不能无脑给 `-` 开头加**，
 * 否则金额列 `-38.00` 会变成文本；只有"是文本又不是数字"时才加。
 */
import { formatTagsCell } from './tag.js'
/** 表头：顺序即列顺序。新增列只许往后追加，避免老用户的 Excel 模板错位。 */
export const TX_CSV_HEADER = ['日期时间', '类型', '分类', '金额(元)', '备注', '账本', '标签']

/** UTF-8 BOM（\uFEFF） */
export const CSV_BOM = '\uFEFF'

/**
 * 公式注入防护：Excel 会把以这些字符开头的单元格当公式。
 * `-` 单独判断 —— 数字（-38.00）必须保持数字，只有非数字文本才加引号。
 */
function guardFormula(s) {
  if (/^[=+@\t\r]/.test(s)) return "'" + s
  if (s.charAt(0) === '-' && isNaN(Number(s))) return "'" + s
  return s
}

/** 单个单元格 → CSV 字面量（含转义与公式防护） */
export function csvCell(value) {
  if (value === null || value === undefined) return ''
  let s = guardFormula(String(value))
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

/** 二维数组 → CSV 文本（CRLF 分隔，**不带** BOM） */
export function toCsv(rows) {
  const list = Array.isArray(rows) ? rows : []
  return list
    .map(function (r) {
      const cells = Array.isArray(r) ? r : []
      return cells.map(csvCell).join(',')
    })
    .join('\r\n')
}

/** 补 BOM（幂等：已有 BOM 不重复加） */
export function withBom(text) {
  const s = String(text === null || text === undefined ? '' : text)
  return s.charAt(0) === CSV_BOM ? s : CSV_BOM + s
}

/** '2026-09-30 22:10'（与「我的」页备份时间同格式） */
export function fmtDateTime(ts) {
  const d = new Date(Number(ts) || Date.now())
  function p(n) {
    return String(n).padStart(2, '0')
  }
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
  )
}

/** 整数分 → '19.90' / '-19.90'。整数拼接，不经过浮点，口径与全项目一致。 */
export function centsToYuan(cents, negative) {
  const n = Math.abs(Math.round(Number(cents) || 0))
  const s = String(n).padStart(3, '0')
  return (negative ? '-' : '') + Number(s.slice(0, -2)) + '.' + s.slice(-2)
}

/** 账单文件名：奶蛙记账-账单-2026-09-30-2210.csv */
export function csvFileName(nowTs) {
  const d = new Date(nowTs === null || nowTs === undefined ? Date.now() : nowTs)
  function p(n) {
    return String(n).padStart(2, '0')
  }
  return (
    '奶蛙记账-账单-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    '-' + p(d.getHours()) + p(d.getMinutes()) + '.csv'
  )
}

/**
 * 整库表 → CSV 二维数组（含表头）。
 *
 * 口径：
 * - **软删除的记录不导出**（`deleted_at` 非空是"已删"，备份要留、账单不该留）
 * - 按 `occurred_at` **升序**（看账单的习惯是从早到晚）
 * - 金额：收入为正、支出为负，与首页展示的正负口径一致；Excel 里可以直接求和
 * - 分类型 / 账本名从 category / account 表按 id 映射，查不到退化成「其他」/ 空
 * - **标签**（T5.1）：一格里放多个，用 `|` 连接。不用逗号是因为逗号是 CSV 分隔符 ——
 *   就算加了引号包裹，用户拿 Excel 再另存也容易被拆成两列。老备份没有 tag 两张表时该列全空。
 *
 * @param {{category?:Array, account?:Array, transaction_record?:Array, tag?:Array, transaction_tag?:Array}} tables dumpAll() 的结果
 */
export function buildTxCsvRows(tables) {
  const t = tables || {}
  const catName = {}
  ;(Array.isArray(t.category) ? t.category : []).forEach(function (c) {
    catName[Number(c.id)] = String(c.name === null || c.name === undefined ? '' : c.name)
  })
  const accName = {}
  ;(Array.isArray(t.account) ? t.account : []).forEach(function (a) {
    accName[Number(a.id)] = String(a.name === null || a.name === undefined ? '' : a.name)
  })
  const tagName = {}
  ;(Array.isArray(t.tag) ? t.tag : []).forEach(function (g) {
    tagName[Number(g.id)] = String(g.name === null || g.name === undefined ? '' : g.name)
  })
  // 流水 id → 标签名数组（按 tag id 升序，保证同一批数据导出的列内容稳定）
  const tagsByTx = {}
  ;(Array.isArray(t.transaction_tag) ? t.transaction_tag : []).forEach(function (r) {
    const tx = Number(r && r.transaction_id)
    const id = Number(r && r.tag_id)
    const name = tagName[id]
    if (!tx || !name) return
    if (!tagsByTx[tx]) tagsByTx[tx] = []
    if (tagsByTx[tx].indexOf(name) === -1) tagsByTx[tx].push(name)
  })

  const rows = [TX_CSV_HEADER.slice()]
  const list = (Array.isArray(t.transaction_record) ? t.transaction_record : [])
    .filter(function (r) { return r && !r.deleted_at })
    .slice()
    .sort(function (a, b) { return Number(a.occurred_at) - Number(b.occurred_at) })

  list.forEach(function (r) {
    const income = r.type === 'income'
    rows.push([
      fmtDateTime(r.occurred_at),
      income ? '收入' : '支出',
      catName[Number(r.category_id)] || '其他',
      centsToYuan(r.amount_cents, !income),
      r.note || '',
      accName[Number(r.account_id)] || '',
      formatTagsCell(tagsByTx[Number(r.id)])
    ])
  })
  return rows
}


/** 整库表 → 可直接落盘的 CSV 文本（二维数组 + BOM）。方便一次性导出的调用方；services 走的是分步版 */
export function buildTxCsv(tables) {
  return withBom(toCsv(buildTxCsvRows(tables)))
}
