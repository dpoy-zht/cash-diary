/**
 * 本地提醒（T4.1）—— 每日记账提醒 + 缴费日提醒。**本文件只放纯函数，不碰 plus / uni / storage。**
 *
 * ## 能力边界（必须诚实说明，与 utils/notify.js 的定位一脉相承）
 * 本项目无服务器、未引入任何原生插件，所以**没有系统级定时任务**：
 * Android 的 AlarmManager / WorkManager 必须有原生代码（Java/Kotlin 或原生插件），
 * 纯 JS 层拿不到。因此这里采用「**前台定时器 + 冷启动补偿**」：
 *   1. App 进程活着时，用 setTimeout 在到点那一刻发本地通知（plus.push.createMessage）；
 *   2. 每次 App 启动 / 回前台，检查「今天该提醒但还没提醒过」的项，立刻补发一条；
 *   3. 提醒设置与「已提醒过的日期」都持久化，重启后重新排定 —— 满足验收的「重启后提醒仍在」。
 * 已知限制：App 被系统杀掉且当天从未打开 → 当天不提醒。这与首页超支通知的能力边界完全一致，
 * 也是「无服务器 + 纯前端」的必然代价；要突破就得加原生插件，属批次 5 之外的独立立项。
 *
 * ## 时间口径
 * - 每日提醒：每天 hm（默认 21:00）触发一次。
 * - 缴费提醒：固定支出按自己的 day_of_month 在 FIXED_REMIND_HM（09:00）触发；
 *   29~31 号做月末钳制（与 services/fixed.js 的 postTsFor 同一套口径）。
 * - 去重：以「本地日历日」为粒度（YYYY-MM-DD），当天提醒过就不再提醒。
 *   全部时间戳都是毫秒本地时间，与项目数据铁律一致。
 */
import { pad2, toDateStr } from './date.js'

/** 每日提醒配置存储键：{ enabled: boolean, hm: 'HH:mm' } */
export const DAILY_CFG_KEY = 'cashDiary.remind.daily'
/** 已提醒记录存储键：{ daily: 'YYYY-MM-DD', fixed: { 'YYYY-MM-DD': [id, ...] } } */
export const REMIND_FIRED_KEY = 'cashDiary.remind.fired'
/** 每日提醒默认时刻（晚上 9 点，一天结束前，最不容易打扰） */
export const DEFAULT_DAILY_HM = '21:00'
/** 缴费提醒固定时刻（早上 9 点，白天方便处理） */
export const FIXED_REMIND_HM = '09:00'

/** 'HH:mm' 严格解析；非法返回 null */
export function parseHm(raw) {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(raw == null ? '' : raw).trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null
  return { h: h, m: mi }
}

/**
 * 'HH:mm' 归一化：补零成两位；非法则回退 fallback，fallback 也非法则 '00:00'。
 * 脏数据（'25:00' / 'abc' / null）不会让提醒时间静默错乱。
 */
export function normalizeHm(raw, fallback) {
  const p = parseHm(raw)
  if (p) return pad2(p.h) + ':' + pad2(p.m)
  const f = parseHm(fallback)
  if (f) return pad2(f.h) + ':' + pad2(f.m)
  return '00:00'
}

/**
 * 每日提醒配置归一化。
 * **默认关闭**：超支通知已经默认开着，再加一个默认开的每日推送太吵；
 * 只认明确的真值（true / 1 / '1' / 'true'）为开，其余一律关。
 */
export function normalizeDailyConfig(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const on = o.enabled === true || o.enabled === 1 || o.enabled === '1' || o.enabled === 'true'
  return { enabled: on, hm: normalizeHm(o.hm, DEFAULT_DAILY_HM) }
}

/** 某天 hm 时刻的毫秒时间戳（nowTs 所在的那一天） */
export function todayAt(hm, nowTs) {
  const p = parseHm(hm) || { h: 0, m: 0 }
  const d = new Date(nowTs == null ? Date.now() : nowTs)
  d.setHours(p.h, p.m, 0, 0)
  return d.getTime()
}

/** 下一次每日提醒（**严格晚于** nowTs）：今天还没到就今天，已过就明天 */
export function nextDailyTs(hm, nowTs) {
  const now = nowTs == null ? Date.now() : nowTs
  const t = todayAt(hm, now)
  if (t > now) return t
  const d = new Date(t)
  d.setDate(d.getDate() + 1) // 用 Date 进位而不是 +86400000，避免夏令时/时区边界踩坑
  return d.getTime()
}

/** 某个月内「day 号 hm 时刻」的时间戳（day 超界时钳到该月最后一天） */
function monthDayAt(base, day, hm) {
  const p = parseHm(hm) || { h: 0, m: 0 }
  const y = base.getFullYear()
  const mo = base.getMonth()
  const lastDay = new Date(y, mo + 1, 0).getDate()
  const d = Math.min(Math.max(1, Math.floor(Number(day) || 1)), lastDay)
  return new Date(y, mo, d, p.h, p.m, 0, 0).getTime()
}

/** 下一次缴费提醒（**严格晚于** nowTs）：本月该日还没到就本月，已过就到下个月 */
export function nextFixedTs(dayOfMonth, hm, nowTs) {
  const now = nowTs == null ? Date.now() : nowTs
  const cur = monthDayAt(new Date(now), dayOfMonth, hm)
  if (cur > now) return cur
  const base = new Date(now)
  base.setDate(1) // 先落到本月 1 号再进月，避免「31 号 + 1 个月」溢出到再下个月
  base.setMonth(base.getMonth() + 1)
  return monthDayAt(base, dayOfMonth, hm)
}

/** 今天是不是这笔固定支出的「记账日」（启用中 + 该日 = 今天，含月末钳制） */
export function isFixedDueToday(f, nowTs) {
  if (!f || !f.enabled) return false
  const now = new Date(nowTs == null ? Date.now() : nowTs)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const day = Math.min(Math.max(1, Math.floor(Number(f.day_of_month) || 1)), lastDay)
  return now.getDate() === day
}

/** 已提醒记录归一化：结构错乱时返回空壳，绝不抛错 */
export function normalizeFired(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const rawFixed = o.fixed && typeof o.fixed === 'object' ? o.fixed : {}
  const fixed = {}
  Object.keys(rawFixed).forEach(function (k) {
    const arr = Array.isArray(rawFixed[k]) ? rawFixed[k] : []
    const ids = arr.map(Number).filter(function (n) { return isFinite(n) && n > 0 })
    if (ids.length) fixed[k] = ids
  })
  return { daily: typeof o.daily === 'string' ? o.daily : '', fixed: fixed }
}

function ymdOf(nowTs) {
  return toDateStr(nowTs == null ? Date.now() : nowTs)
}

/** 今天是否已经提醒过每日记账 */
export function dailyFiredToday(fired, nowTs) {
  return normalizeFired(fired).daily === ymdOf(nowTs)
}

/** 今天已经提醒过哪些固定支出（id 数组） */
export function fixedFiredToday(fired, nowTs) {
  const f = normalizeFired(fired)
  return f.fixed[ymdOf(nowTs)] || []
}

/**
 * 标记「已提醒」，返回**新的**记录对象（不改原对象，纯函数）。
 * @param {'daily'|'fixed'} kind
 * @param {number} id 固定支出 id（daily 传 0/null）
 */
export function markFired(fired, kind, id, nowTs) {
  const next = normalizeFired(fired)
  const ymd = ymdOf(nowTs)
  if (kind === 'daily') {
    next.daily = ymd
    return next
  }
  const cur = next.fixed[ymd] || []
  const n = Number(id)
  if (isFinite(n) && n > 0 && cur.indexOf(n) < 0) next.fixed[ymd] = cur.concat([n])
  return next
}

/**
 * 清理历史：只保留「今天」的记录，避免 fixed 映射按天无限增长。
 * daily 存的若是往期日期也一并清掉（判断永远只比今天）。
 */
export function gcFired(fired, nowTs) {
  const n = normalizeFired(fired)
  const ymd = ymdOf(nowTs)
  const fixed = {}
  if (n.fixed[ymd] && n.fixed[ymd].length) fixed[ymd] = n.fixed[ymd].slice()
  return { daily: n.daily === ymd ? ymd : '', fixed: fixed }
}

/**
 * 「现在就该补发」的提醒（已过点 + 今天还没提醒过），按时间升序。
 * @returns {Array<{kind:'daily'|'fixed', id:number, ts:number}>}
 */
export function dueNowReminders(cfg, fixedList, nowTs, fired) {
  const now = nowTs == null ? Date.now() : nowTs
  const c = normalizeDailyConfig(cfg)
  const out = []
  if (c.enabled) {
    const t = todayAt(c.hm, now)
    if (now >= t && !dailyFiredToday(fired, now)) out.push({ kind: 'daily', id: 0, ts: t })
  }
  const doneIds = fixedFiredToday(fired, now)
  const ft = todayAt(FIXED_REMIND_HM, now)
  const list = Array.isArray(fixedList) ? fixedList : []
  list.forEach(function (f) {
    if (!isFixedDueToday(f, now)) return
    if (now < ft) return
    const id = Number(f && f.id)
    if (!isFinite(id) || id <= 0) return
    if (doneIds.indexOf(id) >= 0) return
    out.push({ kind: 'fixed', id: id, ts: ft })
  })
  return out.sort(function (a, b) { return a.ts - b.ts })
}

/**
 * 「未来待触发」的提醒，按时间升序（调用方取第一个交给定时器）。
 * 注意与 dueNowReminders 不重叠：这里返回的都**严格晚于 now**。
 * @returns {Array<{kind:'daily'|'fixed', id:number, ts:number}>}
 */
export function upcomingReminders(cfg, fixedList, nowTs) {
  const now = nowTs == null ? Date.now() : nowTs
  const c = normalizeDailyConfig(cfg)
  const out = []
  if (c.enabled) out.push({ kind: 'daily', id: 0, ts: nextDailyTs(c.hm, now) })
  const list = Array.isArray(fixedList) ? fixedList : []
  list.forEach(function (f) {
    if (!f || !f.enabled) return
    const id = Number(f.id)
    if (!isFinite(id) || id <= 0) return
    out.push({ kind: 'fixed', id: id, ts: nextFixedTs(f.day_of_month, FIXED_REMIND_HM, now) })
  })
  return out.sort(function (a, b) { return a.ts - b.ts })
}

/* ==================== 调度引擎（依赖全注入，可用假时钟单测） ==================== */

/**
 * setTimeout 的单次最长等待。超过 24.8 天会溢出成 1ms（无脑重排 → 空转），
 * 且长定时器在设备休眠/改时钟后也不可靠 —— 所以最多睡 6 小时就醒来看一眼。
 */
export const MAX_WAIT_MS = 6 * 3600 * 1000

/**
 * 提醒引擎：一轮 = 读状态 → 补发过点的 → 排下一个定时器。
 *
 * 依赖全部由外部注入（load / fire / saveFired / now / setTimer / clearTimer），
 * 因此可以在 Node 里用假时钟与假存储完整测出行为，真机只是换一套实现。
 *
 * @param {object} deps
 * @param {() => Promise<{config:any, list:any[], fired:any}>} deps.load
 * @param {(item:object, ctx:object) => any} deps.fire 发一条提醒（item: {kind,id,ts}）
 * @param {(fired:object) => any} deps.saveFired
 * @param {() => number} [deps.now]
 * @param {(fn:Function, ms:number) => any} [deps.setTimer]
 * @param {(t:any) => void} [deps.clearTimer]
 */
export function createReminderEngine(deps) {
  const d = deps || {}
  const now = typeof d.now === 'function' ? d.now : Date.now
  const setTimer = typeof d.setTimer === 'function' ? d.setTimer : setTimeout
  const clearTimer = typeof d.clearTimer === 'function' ? d.clearTimer : clearTimeout

  let timer = null
  let running = false

  function cancel() {
    if (timer) {
      clearTimer(timer)
      timer = null
    }
  }

  async function tick() {
    cancel()
    if (!running) return { fired: 0, next: null }

    let inputs
    try {
      inputs = await d.load()
    } catch (e) {
      return { fired: 0, next: null }
    }

    const cfg = normalizeDailyConfig(inputs && inputs.config)
    const list = Array.isArray(inputs && inputs.list) ? inputs.list : []
    let fired = normalizeFired(inputs && inputs.fired)
    const t = now()

    // ① 补发：已经过点、今天又还没提醒过的，立刻发
    const due = dueNowReminders(cfg, list, t, fired)
    const ctx = { cfg: cfg, list: list }
    for (let i = 0; i < due.length; i += 1) {
      const item = due[i]
      fired = markFired(fired, item.kind, item.id, t)
      try {
        await d.fire(item, ctx)
      } catch (e) { /* 单条通知发不出去不影响其余与后续排定 */ }
    }

    // 记录只在「有变化」时才落盘（避免每次 onShow 都写一次 storage）
    const gc = gcFired(fired, t)
    if (JSON.stringify(gc) !== JSON.stringify(normalizeFired(inputs && inputs.fired))) {
      try {
        await d.saveFired(gc)
      } catch (e) { /* 存储失败下轮再试，内存里的本次提醒已经发出去了 */ }
    }

    // ② 排下一个
    const next = upcomingReminders(cfg, list, t)[0] || null
    if (!next) return { fired: due.length, next: null }
    const delay = Math.min(MAX_WAIT_MS, Math.max(0, next.ts - t))
    timer = setTimer(function () { return tick() }, delay)
    return { fired: due.length, next: next }
  }

  return {
    start() { running = true; return tick() },
    stop() { running = false; cancel() },
    /** 状态变了（切账本 / 改设置 / 增删固定支出 / 回前台）就重新跑一轮 */
    refresh() { return tick() },
    isRunning() { return running }
  }
}

