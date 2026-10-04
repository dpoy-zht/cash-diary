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

/**
 * 「日期 + 时分」：'2026-09-30 01:20'；非法 / 0 返回 ''。
 * 不依赖 `toLocaleString` —— App 端 JS 引擎没有 Intl，`toLocaleString()` 只能给出
 * 引擎自带的固定格式（真机实测与 H5 不一致），跨端展示会漂移，这里手工拼。
 */
export function dateTimeLabel(ts) {
  const n = Number(ts)
  if (!isFinite(n) || n <= 0) return ''
  const d = new Date(n)
  return (
    d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  )
}

/**
 * 最近 n 个月的 'YYYY-MM' 列表（含当月），**从旧到新**。
 * 用 Date 逐月回退，跨年/跨月由 Date 自己处理，不做手工进位。
 */
export function lastNMonths(n, nowTs) {
  const count = Math.max(1, Math.floor(Number(n) || 1))
  const base = new Date(nowTs == null ? Date.now() : nowTs)
  const out = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    out.push(d.getFullYear() + '-' + pad2(d.getMonth() + 1))
  }
  return out
}

/** 月份标签：'2026-09' → '9月' */
export function ymLabel(ym) {
  const parts = String(ym || '').split('-')
  return Number(parts[1]) + '月'
}

/** 完整月份标签：'2026-09' → '2026年9月'（月度报告标题用） */
export function ymLabelFull(ym) {
  const parts = String(ym == null ? '' : ym).split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  if (!y || !m) return ''
  return y + '年' + m + '月'
}

/**
 * 首页顶部日期文案：**看的是当月就显示到日，看的是别的月就只显示年月**。
 *
 * - 当月：'2026-10' + 今天 → '2026年10月4日'（日期动态取自"今天"，不是硬编码）
 * - 别的月：'2026-09' → '2026年9月'
 *
 * 为什么不每个月都补一个"日"：这个位置本质是**月份导航**（左右箭头切月），
 * 切到 9 月却写着"9月4日"，等于替用户编了一个不存在的日期。补日只在"看当月"时成立。
 *
 * @param {string} ym 当前查看的月份 'YYYY-MM'
 * @param {number} [nowTs] "现在"的时间戳（测试可注入；不传取 Date.now()）
 */
export function homeDateLabel(ym, nowTs) {
  if (!ym) return ''
  const today = toDateStr(nowTs === undefined || nowTs === null ? Date.now() : nowTs)
  if (String(ym) === today.slice(0, 7)) {
    return Number(today.slice(0, 4)) + '年' + Number(today.slice(5, 7)) + '月' + Number(today.slice(8, 10)) + '日'
  }
  return ymLabelFull(ym)
}

/**
 * 某月有多少天（本地时区）：'2026-02' → 28。
 * 用 `new Date(y, m, 0)` 取"下个月的第 0 天"= 本月最后一天，闰年由 Date 自己算。
 * 非法输入返回 0（调用方据此跳过依赖天数的计算，而不是算出 NaN）。
 */
export function daysInMonth(ym) {
  const parts = String(ym == null ? '' : ym).split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  if (!y || !m || m < 1 || m > 12) return 0
  return new Date(y, m, 0).getDate()
}

/** 上一个月的 'YYYY-MM'（跨年自动处理）；非法输入返回空串 */
export function prevYmOf(ym) {
  const parts = String(ym == null ? '' : ym).split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  if (!y || !m || m < 1 || m > 12) return ''
  const d = new Date(y, m - 2, 1)
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1)
}

/**
 * 'YYYY-MM-DD' → 当天 00:00 的毫秒时间戳；非法（含 2026-02-30 这种不存在的日期）返回 null。
 * 与 tsFromDateStr 的区别：那个会把时间部分顶成"此刻"，这个固定 00:00 —— 区间筛选必须用它。
 */
export function dateStrStart(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr == null ? '' : dateStr).trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt.getTime()
}

/**
 * 'YYYY-MM-DD' → **次日** 00:00（左闭右开区间的右端点）。
 * 用它是为了让"结束日期"含当天：用户选 9-30，就该查到 9-30 23:59 的账。
 */
export function dateStrEndExclusive(dateStr) {
  const s = dateStrStart(dateStr)
  if (s === null) return null
  const d = new Date(s)
  d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** date 输入框字符串 → 毫秒时间戳（时间部分取当前时刻；空值返回当前时间） */
export function tsFromDateStr(dstr) {
  const now = new Date()
  if (!dstr) return now.getTime()
  return new Date(dstr + 'T' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':00').getTime()
}

/**
 * 只换日期、不动时刻：把 originalTs 的年月日替换成 dstr，时/分/秒/毫秒沿用原值。
 *
 * 改期编辑（T3.2）必须用它而不是 tsFromDateStr ——
 * 后者会把时刻顶成"现在"，同一天内的排序会莫名改变（原来 15:30 记的，改个日期就跑到 21:50）。
 *
 * @param {number} originalTs 原记录的毫秒时间戳
 * @param {string} dstr 'YYYY-MM-DD'
 * @returns {number} 毫秒时间戳；dstr 非法时原样返回 originalTs
 */
export function replaceDateKeepTime(originalTs, dstr) {
  const ts = Number(originalTs)
  const base = new Date(isFinite(ts) && ts > 0 ? ts : Date.now())
  const parts = String(dstr == null ? '' : dstr).split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  if (!y || !m || !d) return base.getTime()
  base.setFullYear(y, m - 1, d)
  return base.getTime()
}

/* ================= 周期区间（统计页 日 / 周 / 月 / 年 用） ================= */

const DAY_MS = 86400000
const WEEK_MS = 7 * DAY_MS

/** 周一 00:00（中国习惯：周一为一周之始；周日归到下一周，即落在上一周的周一之后） */
export function weekStart(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0 = 周日
  const diff = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - diff)
  return d.getTime()
}

/** 当天 [00:00, 次日 00:00) —— 半开区间 */
export function dayRange(ts) {
  const start = dayStart(ts)
  return [start, start + DAY_MS]
}

/** 该日所在周 [周一 00:00, 下周一 00:00) */
export function weekRange(ts) {
  const start = weekStart(ts)
  return [start, start + WEEK_MS]
}

/** 某年 [1月1日 00:00, 次年 1月1日 00:00) */
export function yearRange(year) {
  const y = Math.floor(Number(year) || 0)
  return [new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime()]
}

/** 最近 n 天的 0 点时间戳（含当天，从旧到新） */
export function lastNDayStarts(n, ts) {
  const count = Math.max(1, Math.floor(Number(n) || 1))
  const base = dayStart(ts == null ? Date.now() : ts)
  const out = []
  for (let i = count - 1; i >= 0; i -= 1) out.push(base - i * DAY_MS)
  return out
}

/** 最近 n 周的周一 0 点（含本周，从旧到新） */
export function lastNWeekStarts(n, ts) {
  const count = Math.max(1, Math.floor(Number(n) || 1))
  const base = weekStart(ts == null ? Date.now() : ts)
  const out = []
  for (let i = count - 1; i >= 0; i -= 1) out.push(base - i * WEEK_MS)
  return out
}

/** 某年的 12 个月 'YYYY-MM'（从 1 月到 12 月） */
export function ymsOfYear(year) {
  const y = Math.floor(Number(year) || 0)
  const out = []
  for (let m = 1; m <= 12; m += 1) out.push(y + '-' + pad2(m))
  return out
}

/** 趋势柱标签（日/周分桶用）：'9月21日' → '9/21' */
export function dayTrendLabel(ts) {
  const d = new Date(ts)
  return d.getMonth() + 1 + '/' + d.getDate()
}

/** 期间名：本日 / 本周 / 本月 / 本年（收支合计行用） */
export function periodNameOf(key) {
  if (key === 'day') return '本日'
  if (key === 'week') return '本周'
  if (key === 'year') return '本年'
  return '本月'
}
