/**
 * 统计页纯函数：支出按分类聚合、环形图扇区、排行占比。
 * 与 DOM / uni 无关，可单测。
 */
import { colorOf } from './palette.js'

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

/** 等级称号表：按累计记录笔数升级，每 10 笔一级 */
const LEVEL_TITLES = [
  '记账萌新',
  '攒钱新手',
  '攒钱小能手',
  '记账达人',
  '攒钱高手',
  '理财小能龙',
  '暴富预备役',
  '奶龙财务官',
  '金库守护者',
  '奶龙首富'
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
