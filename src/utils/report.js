/**
 * 月度账单报告（T4.4）：纯函数，输入当月/上月流水与总预算，输出报告需要的全部数字。
 *
 * 为什么要单独一层：报告页上的每个数字都得跟"统计页"对得上，而统计页的口径
 * 散在 utils/stats.js（聚合）与页面 computed（拼装）里。这里把口径集中成一处纯函数，
 * 页面只负责排版 —— 数字错了在测试里一眼就能看出来，不用去真机上比对。
 *
 * 口径（写清楚，避免与统计页出现第二种解释）：
 * - 一律跳过软删除记录（deleted_at != null）
 * - 金额都是整数分，页面才转元
 * - 记账天数 = 有记录的**本地日历日**去重计数（不是 24 小时窗口）
 * - 超支天数 = 该日支出 > 日均额度（月总预算 ÷ 当月天数，向上取整）；
 *   未设总预算时不算这一项（"没打算管"不该被判成超支，与 utils/budget.js 一致）
 * - 环比 = 与**上一个自然月**比；上月 0 时百分比无意义（除数为 0），给 null 让页面显示"—"
 */
import { colorOf } from './palette.js'
import { dayStart, daysInMonth, prevYmOf, ymLabelFull } from './date.js'
import { expenseByCategory, sumByType } from './stats.js'

/** 分类排行取前几名 */
export const TOP_N = 5

/** 去掉软删除与空行 */
function live(rows) {
  return (Array.isArray(rows) ? rows : []).filter(function (r) {
    return r && r.deleted_at == null
  })
}

/** 安全转分：负数/NaN/undefined 一律 0 */
function cents(v) {
  const n = Math.floor(Number(v))
  return isFinite(n) && n > 0 ? n : 0
}

/** '9月12日'（报告里出现的日期都短，不写年份） */
function dayText(ts) {
  const d = new Date(ts)
  return d.getMonth() + 1 + '月' + d.getDate() + '日'
}

/**
 * 环比：本期 vs 上期。
 * @returns {{curCents:number, prevCents:number, diffCents:number, pct:number|null, dir:'up'|'down'|'flat'}}
 *   pct 为 null 表示"算不了"（上期为 0）；dir 是给人看的方向。
 */
export function monthOverMonth(curCents, prevCents) {
  const c = cents(curCents)
  const p = cents(prevCents)
  const diff = c - p
  let dir = 'flat'
  if (diff > 0) dir = 'up'
  else if (diff < 0) dir = 'down'
  // 上期为 0：涨幅算不出来（除零），但方向仍然是明确的
  const pct = p ? Math.round((diff / p) * 1000) / 10 : null
  return { curCents: c, prevCents: p, diffCents: diff, pct: pct, dir: dir }
}

/** 逐日支出：Map<当天 0 点时间戳, 分>（只算支出，收入不进"超支"判断） */
export function dailyExpense(rows) {
  const map = new Map()
  live(rows).forEach(function (r) {
    if (r.type !== 'expense') return
    const c = cents(r.amount_cents)
    if (!c) return
    const k = dayStart(r.occurred_at)
    map.set(k, (map.get(k) || 0) + c)
  })
  return map
}

/**
 * 当月金额最大的一笔（按类型）。
 * 并列时取时间较晚的那笔 —— 同一金额下"最近发生的"更有叙述价值。
 * @returns {{cents:number, note:string, name:string, icon:string, color:string, ts:number, dateText:string}|null}
 */
export function biggestOf(rows, type, categories) {
  const byId = new Map(
    (Array.isArray(categories) ? categories : []).map(function (c) { return [c.id, c] })
  )
  let best = null
  live(rows).forEach(function (r) {
    if (r.type !== type) return
    const c = cents(r.amount_cents)
    if (!c) return
    const ts = Number(r.occurred_at) || 0
    if (!best || c > best.cents || (c === best.cents && ts > best.ts)) {
      best = { cents: c, note: String(r.note || ''), ts: ts, category_id: r.category_id }
    }
  })
  if (!best) return null
  const cat = byId.get(best.category_id) || { name: '其他', icon: 'more' }
  return {
    cents: best.cents,
    note: best.note,
    name: cat.name,
    icon: cat.icon,
    color: colorOf(cat),
    ts: best.ts,
    dateText: dayText(best.ts)
  }
}

/**
 * 按标签汇总支出（T5.1）。
 *
 * **一笔挂多个标签时，会在多个标签里各计一次** —— 这是"按标签看"的固有语义，不是 bug：
 * 一笔"出差打车"既属于「出差」也属于「报销」，两处都该看到它。
 * 因此各标签金额之和可能大于当月总支出，所以额外返回 `overlaps` 让界面如实提示，
 * 而不是让用户自己发现"占比加起来超过 100%"。
 *
 * `pct` 的分母仍是**当月总支出**（不是各标签之和）：这样单看一个标签的占比仍有意义。
 *
 * @param {Array} rows 当月流水（已在 buildMonthlyReport 里过滤过软删除）
 * @param {Array} tags 标签表
 * @param {Array} txTags 流水-标签关联行
 * @param {number} topN 取前几个
 * @returns {{list:Array, overlaps:boolean, taggedCount:number}}
 */
export function tagBreakdown(rows, tags, txTags, topN) {
  const list = Array.isArray(rows) ? rows : []
  const n = Math.max(1, Math.floor(Number(topN) || TOP_N))
  const nameById = {}
  const colorById = {}
  ;(Array.isArray(tags) ? tags : []).forEach(function (g) {
    nameById[Number(g.id)] = String(g.name == null ? '' : g.name)
    colorById[Number(g.id)] = String(g.color == null ? '' : g.color)
  })

  // 只统计**支出**：标签的占比是与支出结构对照着看的，收入混进来没有解释力
  const expenseByTx = {}
  let totalExpense = 0
  list.forEach(function (r) {
    if (r.type !== 'expense') return
    const cents = Number(r.amount_cents) || 0
    expenseByTx[Number(r.id)] = cents
    totalExpense += cents
  })

  const idsByTx = {}
  ;(Array.isArray(txTags) ? txTags : []).forEach(function (r) {
    const tx = Number(r && r.transaction_id)
    const id = Number(r && r.tag_id)
    if (!(tx in expenseByTx) || !nameById[id]) return
    if (!idsByTx[tx]) idsByTx[tx] = []
    if (idsByTx[tx].indexOf(id) === -1) idsByTx[tx].push(id)
  })

  const agg = {}
  let overlaps = false
  let taggedCount = 0
  Object.keys(idsByTx).forEach(function (txKey) {
    const ids = idsByTx[txKey]
    taggedCount += 1
    if (ids.length > 1) overlaps = true
    const cents = expenseByTx[Number(txKey)] || 0
    ids.forEach(function (id) {
      if (!agg[id]) agg[id] = { tag_id: id, name: nameById[id], count: 0, cents: 0 }
      agg[id].count += 1
      agg[id].cents += cents
    })
  })

  const out = Object.keys(agg)
    .map(function (k) { return agg[k] })
    .sort(function (a, b) { return b.cents - a.cents || a.name.localeCompare(b.name) })
    .slice(0, n)
    .map(function (r, i) {
      return {
        rank: i + 1,
        tag_id: r.tag_id,
        name: r.name,
        /** 色 key（c1..c8），页面用它取色；不在这里换成色值，保持"配色只在 palette 一处" */
        color: colorById[r.tag_id] || '',
        count: r.count,
        cents: r.cents,
        pct: totalExpense ? r.cents / totalExpense : 0
      }
    })

  return { list: out, overlaps: overlaps, taggedCount: taggedCount, totalExpenseCents: totalExpense }
}

/**
 * 生成一份月度报告。
 *
 * @param {object} input
 * @param {string} input.ym 目标月份 'YYYY-MM'
 * @param {Array} input.records 当月流水
 * @param {Array} [input.prevRecords] 上月流水（算环比用；缺省视为空）
 * @param {Array} [input.categories] 分类表
 * @param {number} [input.totalBudgetCents] 当月总预算（分），0/缺省 = 未设
 * @param {Array} [input.tags] 标签表（T5.1；缺省 = 不产出标签区块）
 * @param {Array} [input.txTags] 流水-标签关联行（T5.1）
 * @returns {object} 见下方 return —— 页面不再做任何算术
 */
export function buildMonthlyReport(input) {
  const src = input || {}
  const ym = /^\d{4}-\d{2}$/.test(String(src.ym == null ? '' : src.ym)) ? String(src.ym) : ''
  const cats = Array.isArray(src.categories) ? src.categories : []
  const rows = live(src.records)
  const prevRows = live(src.prevRecords)

  const sum = sumByType(rows)
  const prevSum = sumByType(prevRows)

  const days = daysInMonth(ym)
  const daily = dailyExpense(rows)
  const recordDays = new Set(rows.map(function (r) { return dayStart(r.occurred_at) })).size

  /* ---- 分类 TOP N（与统计页共用 expenseByCategory，口径必然一致） ---- */
  const totalExpense = sum.expenseCents
  const byId = new Map(cats.map(function (c) { return [c.id, c] }))
  const topCategories = expenseByCategory(rows, cats)
    .slice(0, TOP_N)
    .map(function (r, i) {
      const cat = byId.get(r.category_id) || {}
      return {
        rank: i + 1,
        category_id: r.category_id,
        name: r.name,
        icon: cat.icon || 'more',
        color: r.color,
        cents: r.cents,
        pct: totalExpense ? r.cents / totalExpense : 0
      }
    })

  /* ---- 按标签汇总（T5.1）：一笔多标签会重复计入，overlaps 交给界面如实提示 ---- */
  const tagsBreak = tagBreakdown(rows, src.tags, src.txTags, TOP_N)

  /* ---- 超支天数：需要总预算才成立 ---- */
  const limit = cents(src.totalBudgetCents)
  const perDayCents = limit && days ? Math.ceil(limit / days) : 0
  const overDayTs = []
  if (perDayCents) {
    daily.forEach(function (c, ts) {
      if (c > perDayCents) overDayTs.push(ts)
    })
    overDayTs.sort(function (a, b) { return a - b })
  }

  return {
    ym: ym,
    label: ymLabelFull(ym),
    prevYm: prevYmOf(ym),

    daysInMonth: days,
    count: rows.length,
    recordDays: recordDays,

    expenseCents: totalExpense,
    incomeCents: sum.incomeCents,
    balanceCents: sum.incomeCents - totalExpense,
    /** 日均支出：按**自然月天数**摊（"这个月平均每天花多少"），不是只除记账天数 */
    avgPerDayCents: days ? Math.round(totalExpense / days) : 0,

    mom: {
      expense: monthOverMonth(totalExpense, prevSum.expenseCents),
      income: monthOverMonth(sum.incomeCents, prevSum.incomeCents)
    },

    topCategories: topCategories,

    /** 按标签汇总（T5.1）；没有打过任何标签时 list 为空、页面据此不渲染该区块 */
    tagTop: tagsBreak,

    budget: {
      hasBudget: limit > 0,
      limitCents: limit,
      perDayCents: perDayCents,
      overDays: overDayTs.length,
      /** 'YYYY-MM-DD' 列表，页面可直接展示"哪几天超了" */
      overDayList: overDayTs.map(function (ts) {
        const d = new Date(ts)
        const mm = d.getMonth() + 1
        const dd = d.getDate()
        return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd
      })
    },

    biggest: {
      expense: biggestOf(rows, 'expense', cats),
      income: biggestOf(rows, 'income', cats)
    }
  }
}
