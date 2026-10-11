/**
 * 常用组合 / 常用备注推导（批次 B，2026-10-11）—— 纯函数。
 * 输入近 N 天流水，输出记一笔页的候选 chip；store 只负责取数，页面只负责渲染，
 * 三层职责与 tx-search-sql.js / report.js 同构。
 *
 * 口径（写清避免第二种解释）：
 * - 只看**活记录**（deleted_at == null），与全站统计一致
 * - 窗口 = 最近 60 天（含当天）。太短刚养成的习惯两天就消失，太长会把
 *   上上个季节的消费（羽绒服、军训用品）翻出来顶在前面
 * - 组合键 = 类型 + 分类 + 备注(trim) + 金额：四个都对上才算"同一个习惯" ——
 *   早餐 7 元和早餐 9 元是两个价位，混成一条会把金额填错
 * - 组合要求出现 ≥2 次：只花过一次的不叫习惯，一次性大额不该被顶到最前面
 * - 备注不设次数门槛：备注是自由文本，写一次但昨天刚写的也值得提示
 * - 排序一律 次数↓ → 最近发生↓：次数并列时，最近还在用的更有资格占前排
 */

/** 候选回看窗口（天） */
export const QUICK_WINDOW_DAYS = 60
/** 组合入选的最少出现次数 */
export const QUICK_MIN_COUNT = 2
/** 常用组合最多展示几个 */
export const COMBO_MAX = 6
/** 常用备注最多展示几个 */
export const NOTE_MAX = 5

const DAY_MS = 86400000

/** 正整数兜底：非法/越界一律用默认值 */
function intOr(v, dft) {
  const n = Math.floor(Number(v))
  return isFinite(n) && n > 0 ? n : dft
}

/** 窗口内的活流水：类型合法、金额为正、时间落在 [now - 窗口, now] */
function recentLive(rows, now, windowDays) {
  const end = Number(now) || Date.now()
  const start = end - windowDays * DAY_MS
  return (Array.isArray(rows) ? rows : []).filter(function (r) {
    if (!r || r.deleted_at != null) return false
    if (r.type !== 'expense' && r.type !== 'income') return false
    if (!(Number(r.amount_cents) > 0)) return false
    const ts = Number(r.occurred_at) || 0
    return ts > 0 && ts >= start && ts <= end
  })
}

/**
 * 常用组合：按「类型+分类+备注+金额」归并出现次数。
 * @returns {Array<{type:string, categoryId:number, note:string, amountCents:number, count:number, lastAt:number}>}
 */
export function recentCombos(rows, opts) {
  const o = opts || {}
  const windowDays = intOr(o.windowDays, QUICK_WINDOW_DAYS)
  const minCount = intOr(o.minCount, QUICK_MIN_COUNT)
  const topN = intOr(o.topN, COMBO_MAX)
  const now = Number(o.now) || Date.now()

  const map = new Map()
  recentLive(rows, now, windowDays).forEach(function (r) {
    const note = String(r.note == null ? '' : r.note).trim()
    const key = r.type + '|' + Number(r.category_id) + '|' + note + '|' + Number(r.amount_cents)
    const cur = map.get(key)
    if (cur) {
      cur.count += 1
      if (Number(r.occurred_at) > cur.lastAt) cur.lastAt = Number(r.occurred_at)
    } else {
      map.set(key, {
        type: r.type,
        categoryId: Number(r.category_id),
        note: note,
        amountCents: Number(r.amount_cents),
        count: 1,
        lastAt: Number(r.occurred_at) || 0
      })
    }
  })

  return Array.from(map.values())
    .filter(function (c) { return c.count >= minCount })
    .sort(function (a, b) { return b.count - a.count || b.lastAt - a.lastAt })
    .slice(0, topN)
}

/**
 * 常用备注：去重后的最近备注文本（收支都算 —— 备注跟金额无关）。
 * @returns {Array<{note:string, count:number, lastAt:number}>}
 */
export function recentNotes(rows, opts) {
  const o = opts || {}
  const windowDays = intOr(o.windowDays, QUICK_WINDOW_DAYS)
  const minCount = intOr(o.minCount, 1)
  const topN = intOr(o.topN, NOTE_MAX)
  const now = Number(o.now) || Date.now()

  const map = new Map()
  recentLive(rows, now, windowDays).forEach(function (r) {
    const note = String(r.note == null ? '' : r.note).trim()
    if (!note) return
    const cur = map.get(note)
    if (cur) {
      cur.count += 1
      if (Number(r.occurred_at) > cur.lastAt) cur.lastAt = Number(r.occurred_at)
    } else {
      map.set(note, { note: note, count: 1, lastAt: Number(r.occurred_at) || 0 })
    }
  })

  return Array.from(map.values())
    .filter(function (c) { return c.count >= minCount })
    .sort(function (a, b) { return b.count - a.count || b.lastAt - a.lastAt })
    .slice(0, topN)
}
