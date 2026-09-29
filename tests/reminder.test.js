import { describe, it, expect } from 'vitest'
import {
  DAILY_CFG_KEY,
  REMIND_FIRED_KEY,
  DEFAULT_DAILY_HM,
  FIXED_REMIND_HM,
  MAX_WAIT_MS,
  parseHm,
  normalizeHm,
  normalizeDailyConfig,
  todayAt,
  nextDailyTs,
  nextFixedTs,
  isFixedDueToday,
  normalizeFired,
  dailyFiredToday,
  fixedFiredToday,
  markFired,
  gcFired,
  dueNowReminders,
  upcomingReminders,
  createReminderEngine
} from '../src/utils/reminder.js'

/** 固定时钟：2026-09-30（周三）20:00 —— 用本地时间构造，与实现口径一致 */
const T = {
  d30_2000: new Date(2026, 8, 30, 20, 0, 0, 0).getTime(),
  d30_0800: new Date(2026, 8, 30, 8, 0, 0, 0).getTime(),
  d30_2200: new Date(2026, 8, 30, 22, 0, 0, 0).getTime(),
  d29_2000: new Date(2026, 8, 29, 20, 0, 0, 0).getTime(),
  d01_0900: new Date(2026, 8, 1, 9, 0, 0, 0).getTime(),
  d05_0800: new Date(2026, 8, 5, 8, 0, 0, 0).getTime(),
  d05_0900: new Date(2026, 8, 5, 9, 0, 0, 0).getTime()
}

function at(y, mo, d, h, mi) {
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime()
}

describe('T4.1 —— 提醒时刻解析与归一化', () => {
  it('存储键固定（me 页写入、App 启动读取必须一致）', () => {
    expect(DAILY_CFG_KEY).toBe('cashDiary.remind.daily')
    expect(REMIND_FIRED_KEY).toBe('cashDiary.remind.fired')
    expect(DEFAULT_DAILY_HM).toBe('21:00')
    expect(FIXED_REMIND_HM).toBe('09:00')
  })

  it('parseHm：合法返回 {h,m}，越界/脏值返回 null', () => {
    expect(parseHm('09:05')).toEqual({ h: 9, m: 5 })
    expect(parseHm('9:5')).toEqual({ h: 9, m: 5 })
    expect(parseHm(' 23:59 ')).toEqual({ h: 23, m: 59 })
    expect(parseHm('24:00')).toBeNull()
    expect(parseHm('12:60')).toBeNull()
    expect(parseHm('abc')).toBeNull()
    expect(parseHm('')).toBeNull()
    expect(parseHm(null)).toBeNull()
    expect(parseHm(undefined)).toBeNull()
  })

  it('normalizeHm：补零成两位；非法回退 fallback；fallback 也非法落到 00:00', () => {
    expect(normalizeHm('9:5')).toBe('09:05')
    expect(normalizeHm('21:00')).toBe('21:00')
    expect(normalizeHm('99:99', '21:00')).toBe('21:00')
    expect(normalizeHm(null, '07:30')).toBe('07:30')
    expect(normalizeHm('99:99', 'bad')).toBe('00:00')
  })

  it('normalizeDailyConfig：默认关闭 + 默认 21:00；只有明确真值才算开', () => {
    expect(normalizeDailyConfig(null)).toEqual({ enabled: false, hm: '21:00' })
    expect(normalizeDailyConfig({})).toEqual({ enabled: false, hm: '21:00' })
    expect(normalizeDailyConfig({ enabled: 'yes' })).toEqual({ enabled: false, hm: '21:00' }) // 脏值不当真
    expect(normalizeDailyConfig({ enabled: true, hm: '7:05' })).toEqual({ enabled: true, hm: '07:05' })
    expect(normalizeDailyConfig({ enabled: 1 })).toEqual({ enabled: true, hm: '21:00' })
    expect(normalizeDailyConfig({ enabled: 'true', hm: 'xx' })).toEqual({ enabled: true, hm: '21:00' })
  })
})

describe('T4.1 —— 下一次触发时刻', () => {
  it('todayAt：取「当天」的该时刻，日期部分跟随 nowTs', () => {
    expect(todayAt('21:00', T.d30_2000)).toBe(at(2026, 9, 30, 21, 0))
    expect(todayAt('21:00', T.d29_2000)).toBe(at(2026, 9, 29, 21, 0))
  })

  it('nextDailyTs：今天还没到就今天，已过就明天（严格晚于 now）', () => {
    expect(nextDailyTs('21:00', T.d30_2000)).toBe(at(2026, 9, 30, 21, 0))
    expect(nextDailyTs('21:00', T.d30_2200)).toBe(at(2026, 10, 1, 21, 0))
    // 跨年
    expect(nextDailyTs('21:00', at(2026, 12, 31, 23, 0))).toBe(at(2027, 1, 1, 21, 0))
  })

  it('nextFixedTs：本月该日未到取本月，已过取下月', () => {
    // 9/1 看 9 月 5 号 → 本月
    expect(nextFixedTs(5, '09:00', T.d01_0900)).toBe(at(2026, 9, 5, 9, 0))
    // 9/5 08:00 看当天 09:00 → 还是今天
    expect(nextFixedTs(5, '09:00', T.d05_0800)).toBe(at(2026, 9, 5, 9, 0))
    // 9/5 09:00 整 → 严格晚于，落回下月
    expect(nextFixedTs(5, '09:00', T.d05_0900)).toBe(at(2026, 10, 5, 9, 0))
    // 9/30 看 5 号 → 下月
    expect(nextFixedTs(5, '09:00', T.d30_2000)).toBe(at(2026, 10, 5, 9, 0))
  })

  it('nextFixedTs：29~31 号做月末钳制，不会溢出到下下个月', () => {
    // 9 月只有 30 天，31 号钳到 9/30
    expect(nextFixedTs(31, '09:00', T.d01_0900)).toBe(at(2026, 9, 30, 9, 0))
    // 2 月只有 28 天（2027 非闰年），31 号钳到 2/28
    expect(nextFixedTs(31, '09:00', at(2027, 2, 1, 10, 0))).toBe(at(2027, 2, 28, 9, 0))
  })

  it('isFixedDueToday：启用中且「记账日 = 今天」，含月末钳制', () => {
    expect(isFixedDueToday({ enabled: true, day_of_month: 30 }, T.d30_2000)).toBe(true)
    expect(isFixedDueToday({ enabled: true, day_of_month: 29 }, T.d30_2000)).toBe(false)
    // 31 号在 9 月钳到 30 号，所以 9/30 当天算到期
    expect(isFixedDueToday({ enabled: true, day_of_month: 31 }, T.d30_2000)).toBe(true)
    expect(isFixedDueToday({ enabled: false, day_of_month: 30 }, T.d30_2000)).toBe(false)
    expect(isFixedDueToday(null, T.d30_2000)).toBe(false)
  })
})

describe('T4.1 —— 已提醒记录与去重', () => {
  it('normalizeFired：脏数据一律收敛成空壳，不抛错', () => {
    expect(normalizeFired(null)).toEqual({ daily: '', fixed: {} })
    expect(normalizeFired({ daily: 5, fixed: 'x' })).toEqual({ daily: '', fixed: {} })
    expect(normalizeFired({ daily: '2026-09-30', fixed: { '2026-09-30': [1, '2', 0, -3, 'x'] } }))
      .toEqual({ daily: '2026-09-30', fixed: { '2026-09-30': [1, 2] } })
    // 空数组的日期键不带出来，避免键无限增殖
    expect(normalizeFired({ fixed: { '2026-09-30': [] } })).toEqual({ daily: '', fixed: {} })
  })

  it('dailyFiredToday / fixedFiredToday：按本地日历日判断', () => {
    const fired = { daily: '2026-09-30', fixed: { '2026-09-30': [7] } }
    expect(dailyFiredToday(fired, T.d30_2000)).toBe(true)
    expect(dailyFiredToday(fired, T.d29_2000)).toBe(false)
    expect(fixedFiredToday(fired, T.d30_2000)).toEqual([7])
    expect(fixedFiredToday(fired, T.d29_2000)).toEqual([])
  })

  it('markFired：返回新对象（不改原对象），固定支出 id 去重', () => {
    const before = { daily: '', fixed: {} }
    const after = markFired(before, 'daily', 0, T.d30_2000)
    expect(before).toEqual({ daily: '', fixed: {} })
    expect(after.daily).toBe('2026-09-30')

    const a = markFired(after, 'fixed', 3, T.d30_2000)
    const b = markFired(a, 'fixed', 3, T.d30_2000)
    expect(b.fixed['2026-09-30']).toEqual([3])
    // 传入的 id 非法时原样返回，不写入垃圾键
    expect(markFired(after, 'fixed', 0, T.d30_2000).fixed).toEqual({})
  })

  it('gcFired：只保留今天，历史日期清掉（防记录无限增长）', () => {
    expect(gcFired({ daily: '2026-09-29', fixed: { '2026-09-29': [1] } }, T.d30_2000))
      .toEqual({ daily: '', fixed: {} })
    expect(gcFired({ daily: '2026-09-30', fixed: { '2026-09-30': [1], '2026-09-29': [2] } }, T.d30_2000))
      .toEqual({ daily: '2026-09-30', fixed: { '2026-09-30': [1] } })
  })
})

describe('T4.1 —— 待补发 / 待触发清单', () => {
  const cfgOn = { enabled: true, hm: '21:00' }
  const fixedToday = [{ id: 3, enabled: true, day_of_month: 30, amount_cents: 200000, note: '房租' }]

  it('dueNowReminders：已过点且今天没提醒过 → 立刻补发', () => {
    const due = dueNowReminders(cfgOn, [], T.d30_2200, {})
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ kind: 'daily', id: 0 })
    expect(due[0].ts).toBe(at(2026, 9, 30, 21, 0))
  })

  it('dueNowReminders：没到点 / 今天已提醒过 / 开关关着 → 都不补发', () => {
    expect(dueNowReminders(cfgOn, [], T.d30_2000, {})).toEqual([]) // 20:00 还没到 21:00
    expect(dueNowReminders(cfgOn, [], T.d30_2200, { daily: '2026-09-30' })).toEqual([])
    expect(dueNowReminders({ enabled: false, hm: '21:00' }, [], T.d30_2200, {})).toEqual([])
  })

  it('dueNowReminders：固定支出当天过了 09:00 且未提醒过 → 补发；已提醒/未启用则不发', () => {
    const due = dueNowReminders(cfgOn, fixedToday, T.d30_2000, {})
    expect(due.filter(function (x) { return x.kind === 'fixed' }).map(function (x) { return x.id })).toEqual([3])
    // 未到 09:00
    const early = dueNowReminders(cfgOn, fixedToday, T.d30_0800, {})
    expect(early.filter(function (x) { return x.kind === 'fixed' })).toEqual([])
    // 今天已提醒过这笔
    const done = dueNowReminders(cfgOn, fixedToday, T.d30_2000, { fixed: { '2026-09-30': [3] } })
    expect(done.filter(function (x) { return x.kind === 'fixed' })).toEqual([])
    // 不是今天（29 号）
    expect(dueNowReminders(cfgOn, fixedToday, T.d29_2000, {}).filter(function (x) { return x.kind === 'fixed' })).toEqual([])
  })

  it('upcomingReminders：只给「严格晚于 now」的项，且按时间升序', () => {
    // 20:00：每日 21:00 在前，缴费 10/5 09:00 在后
    const up = upcomingReminders(cfgOn, fixedToday, T.d30_2000)
    expect(up.map(function (x) { return x.kind })).toEqual(['daily', 'fixed'])
    expect(up[0].ts).toBe(at(2026, 9, 30, 21, 0))

    // 08:00：缴费 09:00 在前，每日 21:00 在后（排序真的生效）
    const up2 = upcomingReminders(cfgOn, fixedToday, T.d30_0800)
    expect(up2.map(function (x) { return x.kind })).toEqual(['fixed', 'daily'])
    expect(up2[0].ts).toBe(at(2026, 9, 30, 9, 0))
  })

  it('upcomingReminders：每日关着就只剩缴费；固定支出停用就不排', () => {
    const off = upcomingReminders({ enabled: false, hm: '21:00' }, fixedToday, T.d30_2000)
    expect(off.map(function (x) { return x.kind })).toEqual(['fixed'])

    const disabled = upcomingReminders(cfgOn, [{ id: 3, enabled: false, day_of_month: 30 }], T.d30_2000)
    expect(disabled.map(function (x) { return x.kind })).toEqual(['daily'])

    // id 非法（不该出现在库里）直接跳过，避免给定时器排出无效项
    const badId = upcomingReminders(cfgOn, [{ id: 0, enabled: true, day_of_month: 30 }], T.d30_2000)
    expect(badId.map(function (x) { return x.kind })).toEqual(['daily'])
  })
})

/* ==================== 调度引擎（假时钟 + 假定时器） ==================== */

function makeHarness(initial) {
  const state = { t: initial.now, config: initial.config, list: initial.list, fired: initial.fired }
  const timers = []
  const fires = []
  const saved = []
  const engine = createReminderEngine({
    load: function () {
      return Promise.resolve({ config: state.config, list: state.list, fired: state.fired })
    },
    fire: function (item) { fires.push({ kind: item.kind, id: item.id, ts: item.ts }) },
    saveFired: function (f) { saved.push(f); state.fired = f },
    now: function () { return state.t },
    setTimer: function (fn, ms) {
      const h = { fn: fn, ms: ms, cleared: false }
      timers.push(h)
      return h
    },
    clearTimer: function (h) { if (h) h.cleared = true }
  })
  return { engine: engine, state: state, timers: timers, fires: fires, saved: saved }
}

describe('T4.1 —— 调度引擎（补发 + 排定 + 重排）', () => {
  it('启动时补发过点项、落盘去重记录，并把定时器排到下一项', async () => {
    const h = makeHarness({
      now: at(2026, 9, 30, 22, 0), // 已过 21:00
      config: { enabled: true, hm: '21:00' },
      list: [],
      fired: {}
    })
    const r = await h.engine.start()

    expect(h.fires).toEqual([{ kind: 'daily', id: 0, ts: at(2026, 9, 30, 21, 0) }])
    expect(h.saved[0].daily).toBe('2026-09-30')
    // 真正的下一个触发点是明天 21:00（间隔 23h，超过单次最长等待，被钳到 MAX_WAIT_MS 后重排）
    expect(r.next.ts).toBe(at(2026, 10, 1, 21, 0))
    expect(h.timers).toHaveLength(1)
    expect(h.timers[0].ms).toBe(MAX_WAIT_MS)
  })

  it('已提醒过就不重复补发，但定时器照排', async () => {
    const h = makeHarness({
      now: at(2026, 9, 30, 22, 0),
      config: { enabled: true, hm: '21:00' },
      list: [],
      fired: { daily: '2026-09-30' }
    })
    await h.engine.start()
    expect(h.fires).toEqual([])
    expect(h.saved).toEqual([]) // 记录没变化就不写盘
    expect(h.timers).toHaveLength(1)
  })

  it('没有任何提醒可排时不设定时器（不空转）', async () => {
    const h = makeHarness({
      now: T.d30_2000,
      config: { enabled: false, hm: '21:00' },
      list: [],
      fired: {}
    })
    await h.engine.start()
    expect(h.fires).toEqual([])
    expect(h.timers).toEqual([])
  })

  it('定时器到点触发 → 发通知 + 重排到下一天', async () => {
    const h = makeHarness({
      now: at(2026, 9, 30, 20, 0),
      config: { enabled: true, hm: '21:00' },
      list: [],
      fired: {}
    })
    await h.engine.start()
    expect(h.fires).toEqual([]) // 还没到点
    expect(h.timers).toHaveLength(1)
    expect(h.timers[0].ms).toBe(3600000)

    // 把时钟推到 21:00 并"触发"定时器
    h.state.t = at(2026, 9, 30, 21, 0)
    const r2 = await h.timers[0].fn()
    expect(r2.next.ts).toBe(at(2026, 10, 1, 21, 0))

    expect(h.fires).toEqual([{ kind: 'daily', id: 0, ts: at(2026, 9, 30, 21, 0) }])
    expect(h.saved[0].daily).toBe('2026-09-30')
    expect(h.timers).toHaveLength(2)
    expect(h.timers[0].cleared).toBe(true)
    expect(h.timers[1].ms).toBe(MAX_WAIT_MS) // 下一个是第二天 21:00，超过单次最长等待
  })

  it('缴费提醒：当天 09:00 触发，并在同一轮里与每日提醒一起排定', async () => {
    const h = makeHarness({
      now: at(2026, 9, 30, 8, 0),
      config: { enabled: true, hm: '21:00' },
      list: [{ id: 3, enabled: true, day_of_month: 30, amount_cents: 200000, note: '房租' }],
      fired: {}
    })
    await h.engine.start()
    expect(h.fires).toEqual([])
    expect(h.timers[0].ms).toBe(3600000) // 先到 09:00 的缴费提醒

    h.state.t = at(2026, 9, 30, 9, 0)
    const r2 = await h.timers[0].fn()
    expect(h.fires).toEqual([{ kind: 'fixed', id: 3, ts: at(2026, 9, 30, 9, 0) }])
    expect(h.saved[0].fixed['2026-09-30']).toEqual([3])
    // 接下来最近的还是当天 21:00 的每日提醒（12 小时，超过单次最长等待）
    expect(r2.next.ts).toBe(at(2026, 9, 30, 21, 0))
    expect(h.timers[1].ms).toBe(MAX_WAIT_MS)
  })

  it('长等待被钳到 MAX_WAIT_MS（避免 setTimeout 溢出与休眠后失准）', async () => {
    const h = makeHarness({
      now: at(2026, 9, 6, 10, 0),
      config: { enabled: false, hm: '21:00' },
      list: [{ id: 9, enabled: true, day_of_month: 5, amount_cents: 100, note: '会员' }],
      fired: {}
    })
    await h.engine.start()
    expect(h.timers).toHaveLength(1)
    expect(h.timers[0].ms).toBe(MAX_WAIT_MS) // 真实间隔约 29 天，被钳到 6 小时
  })

  it('stop 之后不再发通知，也不会重新排定时器', async () => {
    const h = makeHarness({
      now: at(2026, 9, 30, 20, 0),
      config: { enabled: true, hm: '21:00' },
      list: [],
      fired: {}
    })
    await h.engine.start()
    const armed = h.timers[0]
    h.engine.stop()
    expect(armed.cleared).toBe(true)
    expect(h.engine.isRunning()).toBe(false)

    h.state.t = at(2026, 9, 30, 21, 0)
    await armed.fn() // 陈旧定时器即使被触发也什么都不做
    expect(h.fires).toEqual([])
    expect(h.timers).toHaveLength(1)
  })

  it('读数据失败时不抛错、不设定时器（提醒坏了也不能拖垮 App）', async () => {
    const engine = createReminderEngine({
      load: function () { return Promise.reject(new Error('db down')) },
      fire: function () { throw new Error('不该被调用') },
      saveFired: function () {},
      now: function () { return T.d30_2000 }
    })
    await expect(engine.start()).resolves.toEqual({ fired: 0, next: null })
  })

  it('单条通知发送失败不影响同轮其余提醒与后续排定', async () => {
    const timers = []
    const saved = []
    const engine = createReminderEngine({
      load: function () {
        return Promise.resolve({
          config: { enabled: true, hm: '09:00' },
          list: [{ id: 3, enabled: true, day_of_month: 30 }],
          fired: {}
        })
      },
      fire: function (item) {
        if (item.kind === 'daily') throw new Error('通知发不出去')
      },
      saveFired: function (f) { saved.push(f) },
      now: function () { return at(2026, 9, 30, 22, 0) },
      setTimer: function (fn, ms) { timers.push(ms); return {} },
      clearTimer: function () {}
    })
    await engine.start()
    // 每日那条抛了错，但固定支出那条照样标记为已提醒并落盘
    expect(saved[0].daily).toBe('2026-09-30')
    expect(saved[0].fixed['2026-09-30']).toEqual([3])
    expect(timers).toHaveLength(1)
  })
})
