/**
 * 统计页纯函数：支出按分类聚合、环形图扇区、排行占比。
 * 与 DOM / uni 无关，可单测。
 */
import { colorOf } from './palette.js'
import {
  ymOf,
  dayStart,
  weekStart,
  dayRange,
  weekRange,
  yearRange,
  monthRange,
  lastNDayStarts,
  lastNWeekStarts,
  lastNMonths,
  ymsOfYear
} from './date.js'

/**
 * 把一个月内的支出流水聚合成"分类 → 金额"，按金额降序。
 * 只统计支出；收入不进环形图（与 v2.0 参考包一致）。
 * @param {Array} records 流水（含 type / category_id / amount_cents）
 * @param {Array} categories 分类表（id / name / icon）
 * @returns {Array<{category_id:number,name:string,color:string,cents:number}>}
 */
export function expenseByCategory(records, categories) {
  const cats = Array.isArray(categories) ? categories : []
  const byId = new Map(cats.map(function (c) { return [c.id, c] }))

  const map = new Map()
  for (const r of records || []) {
    if (!r || r.type !== 'expense' || r.deleted_at != null) continue
    const cur = map.get(r.category_id) || { category_id: r.category_id, cents: 0 }
    cur.cents += r.amount_cents
    map.set(r.category_id, cur)
  }

  const rows = []
  for (const row of map.values()) {
    const cat = byId.get(row.category_id) || { id: row.category_id, name: '其他', icon: '📦' }
    rows.push({
      category_id: row.category_id,
      name: cat.name,
      color: colorOf(cat),
      cents: row.cents
    })
  }
  rows.sort(function (a, b) { return b.cents - a.cents })
  return rows
}

/**
 * 给每行补上占比与扇区边界（0~1）。
 * @returns {Array} 每项多 pct / from / to 三个字段
 */
export function donutSegments(rows) {
  const list = Array.isArray(rows) ? rows : []
  const total = list.reduce(function (s, r) { return s + r.cents }, 0)
  if (total <= 0) return []
  let acc = 0
  return list.map(function (r) {
    const from = acc / total
    acc += r.cents
    const to = acc / total
    return { name: r.name, color: r.color, cents: r.cents, pct: r.cents / total, from: from, to: to }
  })
}

/**
 * 生成 conic-gradient() 背景值（百分比制，与 v2.0 参考包一致）。
 * 无数据返回 'none'。
 */
export function conicGradient(segments) {
  if (!segments || !segments.length) return 'none'
  const stops = segments.map(function (s) {
    const from = (s.from * 100).toFixed(2)
    const to = (s.to * 100).toFixed(2)
    return s.color + ' ' + from + '% ' + to + '%'
  })
  return 'conic-gradient(' + stops.join(',') + ')'
}

/**
 * 当前环境能不能画 conic-gradient（T3.7）。
 *
 * Chrome 69 以下（Android 8 及更早的 WebView）不支持，环形图会整块空白；
 * 统计页据此降级为纯色环 + 文字指引，保证"结构和数字仍可读"。
 * 取不到 CSS.supports（非浏览器环境）时保守返回 false。
 *
 * @returns {boolean}
 */
export function supportsConicGradient() {
  try {
    if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
    return (
      CSS.supports('background', 'conic-gradient(#fff, #000)') ||
      CSS.supports('background-image', 'conic-gradient(#fff, #000)')
    )
  } catch (e) {
    return false
  }
}

/**
 * 首页余额卡数字：结余 = 收入 − 支出（分）。
 */
export function balanceCents(summary) {
  const s = summary || {}
  return (s.incomeCents || 0) - (s.expenseCents || 0)
}

/** 本地日历日的起点（0 点），按手机本地时区 */
function dayStartOf(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * 连续记账天数：从今天（或昨天）往前数，有多少天是连续的"有记账"。
 *
 * 规则说明（避免出现"今天还没记就断签"的挫败感）：
 * - 今天有记录 → 从今天起往前数
 * - 今天还没记但昨天有 → 从昨天起往前数（今天算作"还没断"）
 * - 昨天也没有 → 连续中断，返回 0
 *
 * @param {number[]} timestamps 最近的记录时间戳（需要覆盖到连续段起点）
 * @param {number} nowTs 当前时间
 * @returns {number} 连续天数
 */
export function streakDays(timestamps, nowTs) {
  const list = Array.isArray(timestamps) ? timestamps : []
  if (!list.length) return 0

  const days = new Set(list.map(dayStartOf))
  const today = dayStartOf(nowTs == null ? Date.now() : nowTs)
  const DAY = 86400000

  let cursor
  if (days.has(today)) cursor = today
  else if (days.has(today - DAY)) cursor = today - DAY
  else return 0

  let n = 0
  while (days.has(cursor)) {
    n += 1
    cursor -= DAY
  }
  return n
}

/**
 * 把一批流水按**本地日历月**分桶（趋势图用）。
 * 注意用 ymOf（本地时区）而不是 UTC 月份 —— 否则月初/月末的账会跑到隔壁月（铁律 2）。
 *
 * @param {Array} records 流水（含软删除的也没关系，这里会跳过）
 * @param {string[]} ymList 要统计的月份，顺序即返回顺序
 * @returns {Array<{ym:string, expenseCents:number, incomeCents:number}>}
 */
export function monthlySummaries(records, ymList) {
  const months = Array.isArray(ymList) ? ymList : []
  const buckets = {}
  months.forEach(function (ym) {
    buckets[ym] = { ym: ym, expenseCents: 0, incomeCents: 0 }
  })
  const list = Array.isArray(records) ? records : []
  list.forEach(function (r) {
    if (!r || r.deleted_at != null) return
    const bucket = buckets[ymOf(r.occurred_at)]
    if (!bucket) return // 不在统计区间内的记录直接忽略
    if (r.type === 'expense') bucket.expenseCents += r.amount_cents
    else if (r.type === 'income') bucket.incomeCents += r.amount_cents
  })
  return months.map(function (ym) { return buckets[ym] })
}

/**
 * 柱状图高度百分比（以最大值为 100%）。
 * 有值但很小的柱子给一个 4% 的下限，否则看起来像"没有数据"。
 */
export function barPercents(values) {
  const list = Array.isArray(values) ? values : []
  const max = list.reduce(function (m, v) {
    const n = Math.max(0, Number(v) || 0)
    return n > m ? n : m
  }, 0)
  if (!max) return list.map(function () { return 0 })
  return list.map(function (v) {
    const n = Math.max(0, Number(v) || 0)
    if (!n) return 0
    return Math.max(4, Math.round((n / max) * 100))
  })
}

/** 命中最大值的下标（并列时取第一个）；全 0 返回 -1。趋势图用来高亮最高那根柱。 */
export function maxIndex(values) {
  const list = Array.isArray(values) ? values : []
  let idx = -1
  let best = -1
  list.forEach(function (v, i) {
    const n = Math.max(0, Number(v) || 0)
    if (n > best) {
      best = n
      idx = i
    }
  })
  return best > 0 ? idx : -1
}

/** 等级称号表：按累计记录笔数升级，每 10 笔一级 */
const LEVEL_TITLES = [
  '记账萌新',
  '攒钱新手',
  '攒钱小能手',
  '记账达人',
  '攒钱高手',
  '理财小能龙',
  '暴富预备役',
  '奶蛙财务官',
  '金库守护者',
  '奶蛙首富'
]

/**
 * 按累计记录笔数算等级（每 10 笔升一级，最高 10 级）。
 * @returns {{level:number, title:string}}
 */
export function levelOf(totalCount) {
  const n = Math.max(0, Math.floor(Number(totalCount) || 0))
  const idx = Math.min(LEVEL_TITLES.length - 1, Math.floor(n / 10))
  return { level: idx + 1, title: LEVEL_TITLES[idx] }
}

/* ================= 日 / 周 / 月 / 年 统计（2026-09-27） ================= */

/** 一周的毫秒数 */
const WEEK_MS = 7 * 86400000

/**
 * 统计期间 [start, end) 半开区间（本地时区）：
 * day = 当天 0 点起；week = 周一 0 点起（周一为一周之始）；
 * month = 该日所在月；year = 该日所在年。未知 key 兜底为月。
 */
export function periodRange(key, ts) {
  const t = ts == null ? Date.now() : ts
  if (key === 'day') return dayRange(t)
  if (key === 'week') return weekRange(t)
  if (key === 'year') return yearRange(new Date(t).getFullYear())
  const d = new Date(t)
  return monthRange(d.getFullYear(), d.getMonth() + 1)
}

/**
 * 支出 / 收入合计（跳过软删除）。期间合计行、空状态判断共用。
 * @returns {{expenseCents:number, incomeCents:number}}
 */
export function sumByType(records) {
  const out = { expenseCents: 0, incomeCents: 0 }
  for (const r of records || []) {
    if (!r || r.deleted_at != null) continue
    if (r.type === 'expense') out.expenseCents += r.amount_cents
    else if (r.type === 'income') out.incomeCents += r.amount_cents
  }
  return out
}

/**
 * 通用分桶（趋势柱）：keyOf(record) 决定落桶，keys 顺序即返回顺序。
 * 落不进任何桶的记录忽略；软删除跳过。monthlySummaries 的月分桶是它的特例。
 * @returns {Array<{key:any, expenseCents:number, incomeCents:number}>}
 */
export function bucketSummaries(records, keys, keyOf) {
  const list = Array.isArray(keys) ? keys : []
  const buckets = {}
  list.forEach(function (k) {
    buckets[k] = { key: k, expenseCents: 0, incomeCents: 0 }
  })
  const rows = Array.isArray(records) ? records : []
  rows.forEach(function (r) {
    if (!r || r.deleted_at != null) return
    const bucket = buckets[keyOf(r.occurred_at)]
    if (!bucket) return
    if (r.type === 'expense') bucket.expenseCents += r.amount_cents
    else if (r.type === 'income') bucket.incomeCents += r.amount_cents
  })
  return list.map(function (k) { return buckets[k] })
}

/**
 * 各期间的趋势分桶规格（决定「近 7 天 / 近 4 周 / 近 6 个月 / 全年逐月」）：
 * - day  → 最近 7 天，按天分桶
 * - week → 最近 4 周，按周分桶（周一起点）
 * - month→ 最近 6 个月，按月分桶（与首页趋势一致）
 * - year → 当年 12 个月，按月分桶
 * start/end 覆盖"期间本体 + 趋势区间"的超集，供一次区间查询用。
 */
export function trendSpecFor(key, anchorTs) {
  const t = anchorTs == null ? Date.now() : anchorTs
  if (key === 'day') {
    const keys = lastNDayStarts(7, t)
    return { keys: keys, keyOf: dayStart, start: keys[0], end: keys[keys.length - 1] + 86400000 }
  }
  if (key === 'week') {
    const keys = lastNWeekStarts(4, t)
    return { keys: keys, keyOf: weekStart, start: keys[0], end: keys[keys.length - 1] + WEEK_MS }
  }
  if (key === 'year') {
    const y = new Date(t).getFullYear()
    const range = yearRange(y)
    return { keys: ymsOfYear(y), keyOf: ymOf, start: range[0], end: range[1] }
  }
  // month：近 6 个月
  const months = lastNMonths(6, t)
  const first = months[0].split('-').map(Number)
  const last = months[months.length - 1].split('-').map(Number)
  return {
    keys: months,
    keyOf: ymOf,
    start: monthRange(first[0], first[1])[0],
    end: monthRange(last[0], last[1])[1]
  }
}

/**
 * 某一天的支出合计（整数分）。
 *
 * 用于首页日期标题后显示「今日消费」。判据与`expenseByCategory` 完全一致
 * （type==='expense' 且未软删除）—— 两处口径必须相同，否则标题上的合计
 * 和下方分类汇总对不上，用户会以为算错了。
 *
 * @param {Array} records 当天的流水
 * @returns {number} 整数分；无支出返回 0
 */
export function expenseSumOfDay(records) {
  let total = 0
  for (const r of records || []) {
    if (!r || r.type !== 'expense' || r.deleted_at != null) continue
    total += r.amount_cents
  }
  return total
}
