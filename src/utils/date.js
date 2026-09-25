/**
 * 日期工具 —— 铁律：存储一律毫秒时间戳，展示时才格式化为本地时间。
 */

export function pad2(n) {
  return (n < 10 ? '0' : '') + n
}

/** '2026-09' */
export function ymOf(ts) {
  const d = new Date(ts)
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1)
}

/** 某年某月的 [月初毫秒, 下月月初毫秒) —— 半开区间，SQL/过滤统一用它 */
export function monthRange(year, month) {
  const start = new Date(year, month - 1, 1).getTime()
  const end = new Date(year, month, 1).getTime()
  return [start, end]
}

/** 当天 00:00 的毫秒时间戳（按天分组用） */
export function dayStart(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const WEEK = '日一二三四五六'

/** '今天 9月24日 周三' / '昨天 …' / '9月22日 周一' */
export function dayLabel(ts) {
  const d = new Date(ts)
  const base = d.getMonth() + 1 + '月' + d.getDate() + '日 周' + WEEK[d.getDay()]
  const diff = Math.round((dayStart(Date.now()) - dayStart(ts)) / 86400000)
  if (diff === 0) return '今天 ' + base
  if (diff === 1) return '昨天 ' + base
  return base
}

/** 流水按天分组：返回 [{ day, items }] ，天按倒序、组内按时间倒序 */
export function groupByDay(records) {
  const map = {}
  records.forEach(function (r) {
    const k = dayStart(r.occurred_at)
    ;(map[k] = map[k] || []).push(r)
  })
  return Object.keys(map)
    .sort(function (a, b) { return Number(b) - Number(a) })
    .map(function (k) {
      return {
        day: Number(k),
        items: map[k].sort(function (a, b) { return b.occurred_at - a.occurred_at })
      }
    })
}

/** date 输入框值：'2026-09-24' */
export function toDateStr(ts) {
  const d = new Date(ts)
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

/** date 输入框字符串 → 毫秒时间戳（时间部分取当前时刻；空值返回当前时间） */
export function tsFromDateStr(dstr) {
  const now = new Date()
  if (!dstr) return now.getTime()
  return new Date(dstr + 'T' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':00').getTime()
}
