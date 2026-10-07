import { describe, it, expect } from 'vitest'
import {
  expenseByCategory,
  expenseSumOfDay,
  donutSegments,
  conicGradient,
  supportsConicGradient,
  sectorAtPoint,
  prevPeriodRange,
  momOf,
  momLabelOf,
  pctText,
  filterByCategoryIds,
  DONUT_HOLE_RATIO,
  balanceCents,
  streakDays,
  levelOf,
  monthlySummaries,
  barPercents,
  maxIndex,
  periodRange,
  sumByType,
  bucketSummaries,
  trendSpecFor
} from '../src/utils/stats.js'
import { lastNMonths, ymLabel, weekStart, yearRange } from '../src/utils/date.js'

const CATS = [
  { id: 1, name: '午饭', icon: '🍜' },
  { id: 2, name: '购物', icon: '🛍️' },
  { id: 3, name: '工资', icon: '💼' }
]

describe('expenseByCategory —— 支出按分类聚合', () => {
  it('只统计支出，收入不参与', () => {
    const rows = expenseByCategory(
      [
        { type: 'expense', category_id: 1, amount_cents: 1000 },
        { type: 'income', category_id: 3, amount_cents: 99999 }
      ],
      CATS
    )
    expect(rows.length).toBe(1)
    expect(rows[0].name).toBe('午饭')
    expect(rows[0].cents).toBe(1000)
  })

  it('同分类多笔合并，并按金额降序', () => {
    const rows = expenseByCategory(
      [
        { type: 'expense', category_id: 2, amount_cents: 100 },
        { type: 'expense', category_id: 1, amount_cents: 500 },
        { type: 'expense', category_id: 2, amount_cents: 50 },
        { type: 'expense', category_id: 1, amount_cents: 100 }
      ],
      CATS
    )
    expect(rows.map(function (r) { return r.name })).toEqual(['午饭', '购物'])
    expect(rows[0].cents).toBe(600)
    expect(rows[1].cents).toBe(150)
  })

  it('软删除的记录被排除', () => {
    const rows = expenseByCategory(
      [
        { type: 'expense', category_id: 1, amount_cents: 100 },
        { type: 'expense', category_id: 1, amount_cents: 200, deleted_at: 123 }
      ],
      CATS
    )
    expect(rows[0].cents).toBe(100)
  })

  it('未知分类回落到"其他"，颜色也要能取到（不崩溃）', () => {
    const rows = expenseByCategory([{ type: 'expense', category_id: 99, amount_cents: 42 }], CATS)
    expect(rows[0].name).toBe('其他')
    expect(rows[0].color).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('空输入返回空数组', () => {
    expect(expenseByCategory([], CATS)).toEqual([])
    expect(expenseByCategory(null, CATS)).toEqual([])
  })
})

describe('donutSegments —— 环形图扇区', () => {
  it('空数据返回空数组（页面据此显示空状态）', () => {
    expect(donutSegments([])).toEqual([])
    expect(donutSegments([{ cents: 0 }])).toEqual([])
  })

  it('占比总和为 1，边界首尾相接', () => {
    const segs = donutSegments([
      { name: 'a', color: '#111111', cents: 3 },
      { name: 'b', color: '#222222', cents: 1 }
    ])
    expect(segs.length).toBe(2)
    expect(segs[0].from).toBe(0)
    expect(segs[0].to).toBeCloseTo(0.75)
    expect(segs[1].from).toBeCloseTo(0.75)
    expect(segs[1].to).toBe(1)
    expect(segs[0].pct + segs[1].pct).toBeCloseTo(1)
  })
})

describe('conicGradient —— 环形图背景值', () => {
  it('无数据返回 none', () => {
    expect(conicGradient([])).toBe('none')
    expect(conicGradient(null)).toBe('none')
  })

  it('生成百分比制的 conic-gradient 字符串', () => {
    const g = conicGradient([
      { color: '#ff8a65', from: 0, to: 0.5 },
      { color: '#ffc93c', from: 0.5, to: 1 }
    ])
    expect(g.indexOf('conic-gradient(')).toBe(0)
    expect(g).toContain('#ff8a65 0.00% 50.00%')
    expect(g).toContain('#ffc93c 50.00% 100.00%')
  })
})

describe('balanceCents —— 余额', () => {
  it('结余 = 收入 − 支出', () => {
    expect(balanceCents({ incomeCents: 10000, expenseCents: 3500 })).toBe(6500)
  })
  it('缺字段按 0 处理，不抛错', () => {
    expect(balanceCents({})).toBe(0)
    expect(balanceCents(null)).toBe(0)
  })
})

/** 用本地时间造时间戳，保证与 dayStartOf 的本地时区口径一致 */
function at(y, m, d, h) {
  return new Date(y, m - 1, d, h == null ? 12 : h, 0, 0).getTime()
}
const TODAY = at(2026, 9, 27)

describe('lastNMonths / ymLabel', () => {
  it('返回最近 n 个月（含当月），从旧到新', () => {
    const t = new Date(2026, 8, 27).getTime() // 2026-09
    expect(lastNMonths(6, t)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
  })

  it('跨年正确（1 月往前数要落到去年）', () => {
    const t = new Date(2026, 0, 15).getTime() // 2026-01
    expect(lastNMonths(3, t)).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('n=1 只有当月；非法 n 兜底为 1 个月', () => {
    const t = new Date(2026, 8, 27).getTime()
    expect(lastNMonths(1, t)).toEqual(['2026-09'])
    expect(lastNMonths(0, t)).toEqual(['2026-09'])
    expect(lastNMonths(null, t)).toEqual(['2026-09'])
  })

  it('月份标签去掉前导零', () => {
    expect(ymLabel('2026-09')).toBe('9月')
    expect(ymLabel('2026-12')).toBe('12月')
    expect(ymLabel('')).toBe('NaN月')
  })
})

describe('monthlySummaries —— 按本地日历月分桶（趋势图）', () => {
  const MONTHS = ['2026-07', '2026-08', '2026-09']
  function at(y, m, d, h) {
    return new Date(y, m - 1, d, h == null ? 12 : h, 0, 0).getTime()
  }

  it('按发生时间落到各自月份，支出与收入分开累加', () => {
    const rows = monthlySummaries([
      { type: 'expense', amount_cents: 1000, occurred_at: at(2026, 9, 3) },
      { type: 'expense', amount_cents: 500, occurred_at: at(2026, 9, 20) },
      { type: 'income', amount_cents: 850000, occurred_at: at(2026, 9, 1) },
      { type: 'expense', amount_cents: 2000, occurred_at: at(2026, 8, 31) }
    ], MONTHS)
    expect(rows.length).toBe(3)
    expect(rows[2]).toEqual({ ym: '2026-09', expenseCents: 1500, incomeCents: 850000 })
    expect(rows[1]).toEqual({ ym: '2026-08', expenseCents: 2000, incomeCents: 0 })
    expect(rows[0]).toEqual({ ym: '2026-07', expenseCents: 0, incomeCents: 0 })
  })

  it('月份边界按本地时区归月（月初 0 点、月末 23 点都不跑偏）', () => {
    const rows = monthlySummaries([
      { type: 'expense', amount_cents: 100, occurred_at: at(2026, 9, 1, 0) },
      { type: 'expense', amount_cents: 200, occurred_at: at(2026, 9, 30, 23) }
    ], MONTHS)
    expect(rows[2].expenseCents).toBe(300)
  })

  it('软删除的记录不计入', () => {
    const rows = monthlySummaries([
      { type: 'expense', amount_cents: 1000, occurred_at: at(2026, 9, 5) },
      { type: 'expense', amount_cents: 9999, occurred_at: at(2026, 9, 6), deleted_at: 123 }
    ], MONTHS)
    expect(rows[2].expenseCents).toBe(1000)
  })

  it('不在统计区间内的记录被忽略，返回条数与月份表一致', () => {
    const rows = monthlySummaries([
      { type: 'expense', amount_cents: 1000, occurred_at: at(2025, 1, 5) }
    ], MONTHS)
    expect(rows.length).toBe(3)
    expect(rows.every(function (r) { return r.expenseCents === 0 })).toBe(true)
  })

  it('空入参不抛错', () => {
    expect(monthlySummaries(null, MONTHS).length).toBe(3)
    expect(monthlySummaries([], null)).toEqual([])
  })
})

describe('barPercents / maxIndex —— 柱状图几何', () => {
  it('最大值占 100%，其余按比例', () => {
    expect(barPercents([1000, 500, 0])).toEqual([100, 50, 0])
  })

  it('有值但极小的柱子给 4% 下限（否则看起来像没数据）', () => {
    expect(barPercents([100000, 10])).toEqual([100, 4])
  })

  it('全为 0 时高度全是 0', () => {
    expect(barPercents([0, 0, 0])).toEqual([0, 0, 0])
    expect(barPercents([])).toEqual([])
  })

  it('maxIndex 指向最大值的下标；并列取第一个；全 0 返回 -1', () => {
    expect(maxIndex([1, 5, 3])).toBe(1)
    expect(maxIndex([5, 5, 3])).toBe(0)
    expect(maxIndex([0, 0])).toBe(-1)
    expect(maxIndex([])).toBe(-1)
  })
})

describe('streakDays —— 连续记账天数', () => {
  it('没有记录返回 0', () => {
    expect(streakDays([], TODAY)).toBe(0)
    expect(streakDays(null, TODAY)).toBe(0)
  })

  it('只有今天一条 → 1 天', () => {
    expect(streakDays([at(2026, 9, 27, 9)], TODAY)).toBe(1)
  })

  it('今天往前连续 3 天 → 3 天（同一天多条只算一天）', () => {
    const ts = [at(2026, 9, 27, 9), at(2026, 9, 27, 20), at(2026, 9, 26, 8), at(2026, 9, 25, 22)]
    expect(streakDays(ts, TODAY)).toBe(3)
  })

  it('今天还没记但昨天记了 → 连续不断，从昨天算起', () => {
    const ts = [at(2026, 9, 26, 9), at(2026, 9, 25, 9)]
    expect(streakDays(ts, TODAY)).toBe(2)
  })

  it('昨天与今天都没记 → 中断，返回 0', () => {
    const ts = [at(2026, 9, 25, 9), at(2026, 9, 24, 9)]
    expect(streakDays(ts, TODAY)).toBe(0)
  })

  it('中间断过 → 只数最近那一段', () => {
    const ts = [
      at(2026, 9, 27, 9),
      at(2026, 9, 26, 9),
      // 9/25 缺
      at(2026, 9, 24, 9),
      at(2026, 9, 23, 9)
    ]
    expect(streakDays(ts, TODAY)).toBe(2)
  })

  it('跨月也能连续数', () => {
    const ts = [at(2026, 10, 1, 9), at(2026, 9, 30, 9), at(2026, 9, 29, 9)]
    expect(streakDays(ts, at(2026, 10, 1))).toBe(3)
  })
})

describe('levelOf —— 按累计笔数算等级', () => {
  it('0 笔 = Lv.1', () => {
    const r = levelOf(0)
    expect(r.level).toBe(1)
    expect(r.title).toBe('记账萌新')
  })

  it('每 10 笔升一级', () => {
    expect(levelOf(9).level).toBe(1)
    expect(levelOf(10).level).toBe(2)
    expect(levelOf(25).level).toBe(3)
  })

  it('到顶后不再升（有上限，不会出现空称号）', () => {
    expect(levelOf(1000).level).toBe(10)
    expect(levelOf(1000).title).toBeTruthy()
  })

  it('非法入参不抛错', () => {
    expect(levelOf(null).level).toBe(1)
    expect(levelOf(-5).level).toBe(1)
    expect(levelOf('abc').level).toBe(1)
  })
})

/* ================= 日 / 周 / 月 / 年 统计（2026-09-27） =================
 * 已知锚点：2026-09-27 是周日（其周为 9/21 ~ 9/27）。
 */

describe('periodRange —— 期间半开区间', () => {
  it('day = 当天 [0 点, 次日 0 点)', () => {
    const [start, end] = periodRange('day', at(2026, 9, 27, 15))
    expect(start).toBe(at(2026, 9, 27, 0))
    expect(end).toBe(at(2026, 9, 28, 0))
  })

  it('week = 该日所在周 [周一 0 点, 下周一 0 点)（9/27 周日 → 9/21 起）', () => {
    const [start, end] = periodRange('week', at(2026, 9, 27))
    expect(start).toBe(at(2026, 9, 21, 0))
    expect(end).toBe(at(2026, 9, 28, 0))
  })

  it('month = 该日所在月；year = 该日所在年', () => {
    const [ms, me] = periodRange('month', at(2026, 9, 27))
    expect(ms).toBe(new Date(2026, 8, 1).getTime())
    expect(me).toBe(new Date(2026, 9, 1).getTime())

    const [ys, ye] = periodRange('year', at(2026, 9, 27))
    expect(ys).toBe(new Date(2026, 0, 1).getTime())
    expect(ye).toBe(new Date(2027, 0, 1).getTime())
  })

  it('未知 key 兜底为月', () => {
    const [start] = periodRange('whatever', at(2026, 9, 27))
    expect(start).toBe(new Date(2026, 8, 1).getTime())
  })
})

describe('sumByType —— 期间收支合计', () => {
  it('支出与收入分开累加，软删除跳过', () => {
    const s = sumByType([
      { type: 'expense', amount_cents: 1000 },
      { type: 'expense', amount_cents: 500 },
      { type: 'income', amount_cents: 9000 },
      { type: 'expense', amount_cents: 777, deleted_at: 123 },
      { type: 'unknown', amount_cents: 42 }
    ])
    expect(s).toEqual({ expenseCents: 1500, incomeCents: 9000 })
  })

  it('空入参返回 0，不抛错', () => {
    expect(sumByType([])).toEqual({ expenseCents: 0, incomeCents: 0 })
    expect(sumByType(null)).toEqual({ expenseCents: 0, incomeCents: 0 })
  })
})

describe('bucketSummaries —— 通用分桶', () => {
  const DAY = 86400000
  function byDay(ts) { return Math.floor(ts / DAY) }

  it('按 keyOf 落桶，keys 顺序即返回顺序，支出收入分开', () => {
    const keys = [100, 101, 102]
    const rows = bucketSummaries([
      { type: 'expense', amount_cents: 300, occurred_at: 100 * DAY + 5 },
      { type: 'expense', amount_cents: 200, occurred_at: 100 * DAY + 9 },
      { type: 'income', amount_cents: 8000, occurred_at: 101 * DAY + 1 }
    ], keys, byDay)
    expect(rows.map(function (r) { return r.key })).toEqual([100, 101, 102])
    expect(rows[0]).toEqual({ key: 100, expenseCents: 500, incomeCents: 0 })
    expect(rows[1]).toEqual({ key: 101, expenseCents: 0, incomeCents: 8000 })
    expect(rows[2]).toEqual({ key: 102, expenseCents: 0, incomeCents: 0 })
  })

  it('软删除跳过；落不进桶的记录忽略', () => {
    const rows = bucketSummaries([
      { type: 'expense', amount_cents: 100, occurred_at: 100 * DAY, deleted_at: 1 },
      { type: 'expense', amount_cents: 999, occurred_at: 999 * DAY }
    ], [100], byDay)
    expect(rows[0].expenseCents).toBe(0)
  })

  it('空入参不抛错', () => {
    expect(bucketSummaries(null, [1, 2], byDay).length).toBe(2)
    expect(bucketSummaries([], null, byDay)).toEqual([])
  })
})

describe('trendSpecFor —— 各期间趋势分桶规格', () => {
  it('day → 近 7 天（末桶 = 锚点当天 0 点，区间盖住整 7 天）', () => {
    const anchor = at(2026, 9, 27, 15)
    const spec = trendSpecFor('day', anchor)
    expect(spec.keys.length).toBe(7)
    expect(spec.keys[6]).toBe(at(2026, 9, 27, 0))
    expect(spec.keys[0]).toBe(at(2026, 9, 21, 0))
    expect(spec.end).toBe(at(2026, 9, 28, 0))
    expect(spec.keyOf(anchor)).toBe(at(2026, 9, 27, 0))
  })

  it('week → 近 4 周（末桶 = 锚点所在周的周一）', () => {
    const spec = trendSpecFor('week', at(2026, 9, 27))
    expect(spec.keys.length).toBe(4)
    expect(spec.keys[3]).toBe(at(2026, 9, 21, 0))
    expect(spec.end).toBe(at(2026, 9, 28, 0))
    expect(spec.keyOf(at(2026, 9, 22, 8))).toBe(at(2026, 9, 21, 0))
  })

  it('month → 近 6 个月（ym 字符串桶，与首页趋势一致）', () => {
    const spec = trendSpecFor('month', at(2026, 9, 27))
    expect(spec.keys).toEqual(lastNMonths(6, at(2026, 9, 27)))
    expect(spec.keyOf(at(2026, 9, 1))).toBe('2026-09')
    expect(spec.start).toBe(new Date(2026, 3, 1).getTime())
    expect(spec.end).toBe(new Date(2026, 9, 1).getTime())
  })

  it('year → 当年 12 个月，区间 = 全年', () => {
    const spec = trendSpecFor('year', at(2026, 9, 27))
    expect(spec.keys.length).toBe(12)
    expect(spec.keys[0]).toBe('2026-01')
    expect(spec.keys[11]).toBe('2026-12')
    expect([spec.start, spec.end]).toEqual(yearRange(2026))
    expect(weekStart(at(2026, 9, 21))).toBe(at(2026, 9, 21, 0)) // 周一恒等 sanity
  })

  it('区间超集覆盖：period 本体 ⊆ spec 区间（day 锚点在月中也成立）', () => {
    const anchor = at(2026, 9, 27, 15)
    const pr = periodRange('day', anchor)
    const spec = trendSpecFor('day', anchor)
    expect(spec.start <= pr[0] && pr[1] <= spec.end).toBe(true)
  })
})

describe('supportsConicGradient —— 环形图降级检测（T3.7）', () => {
  function withCSS(fake, fn) {
    globalThis.CSS = fake
    try {
      fn()
    } finally {
      delete globalThis.CSS
    }
  }

  it('取不到 CSS.supports（非浏览器环境）时保守返回 false', () => {
    expect(typeof CSS).toBe('undefined')
    expect(supportsConicGradient()).toBe(false)
  })

  it('渲染引擎认 conic-gradient 时返回 true', () => {
    withCSS({ supports: function () { return true } }, function () {
      expect(supportsConicGradient()).toBe(true)
    })
  })

  it('渲染引擎不认 conic-gradient（老 WebView）时返回 false', () => {
    withCSS({
      supports: function (prop, val) { return String(val).indexOf('conic-gradient') === -1 }
    }, function () {
      expect(supportsConicGradient()).toBe(false)
    })
  })

  it('CSS.supports 抛错时不影响页面渲染，仍返回 false', () => {
    withCSS({ supports: function () { throw new Error('boom') } }, function () {
      expect(supportsConicGradient()).toBe(false)
    })
  })
})

/**
 * 首页日期标题旁的「当日支出」（2026-10-06）。
 *
 * 关键约束：**口径必须与 `expenseByCategory` 完全一致**
 * （type==='expense' 且未软删除）。两边判据一旦漂移，
 * 标题上的合计就会和下方分类汇总对不上，用户会以为算错了。
 */
describe('expenseSumOfDay —— 当日支出合计', () => {
  const E = (cents) => ({ type: 'expense', amount_cents: cents, deleted_at: null })
  const I = (cents) => ({ type: 'income', amount_cents: cents, deleted_at: null })

  it('只累加支出，收入不计', () => {
    expect(expenseSumOfDay([E(1500), E(2250), I(9999)])).toBe(3750)
  })

  it('排除软删除的记录（deleted_at 非空）', () => {
    const deleted = { type: 'expense', amount_cents: 500, deleted_at: 123 }
    expect(expenseSumOfDay([E(1000), deleted])).toBe(1000)
  })

  it('无支出返回 0（含空数组/undefined/null）', () => {
    expect(expenseSumOfDay([])).toBe(0)
    expect(expenseSumOfDay(undefined)).toBe(0)
    expect(expenseSumOfDay(null)).toBe(0)
    expect(expenseSumOfDay([I(100)])).toBe(0)
  })

  it('容忍脏数据（null 元素不崩）', () => {
    expect(expenseSumOfDay([E(100), null, undefined, E(200)])).toBe(300)
  })

  it('与 expenseByCategory 的分类汇总额度一致（同口径校验）', () => {
    const records = [E(1500), E(2250), I(9999),
      { type: 'expense', amount_cents: 500, deleted_at: 123 }]
    const cats = [
      { id: 1, name: '吃饭', icon: 'a', color: '#f00' },
      { id: 2, name: '买菜', icon: 'b', color: '#0f0' }
    ]
    const byCat = expenseByCategory(records, cats)
    const sum = byCat.reduce(function (s, r) { return s + r.cents }, 0)
    expect(sum).toBe(expenseSumOfDay(records))   // 两处口径必须相等
  })
})

/* ================= 环形图交互（2026-10-07） =================
 * 这一批做的都是「看得见的交互」背后的算术：点扇区选中的是哪个分类、
 * 圆心那只环比箭头该朝哪边、明细列表该留哪些行。
 * 几何与判断全部落在纯函数里，页面只负责把事件坐标喂进来。
 */

describe('donutSegments —— 带上 category_id（点扇区后要按 id 筛选）', () => {
  it('category_id 原样带下去：收支两侧都有「红包」，按名字筛会串', () => {
    const segs = donutSegments([
      { category_id: 11, name: '红包', color: '#111111', cents: 60 },
      { category_id: 31, name: '红包', color: '#222222', cents: 40 }
    ])
    expect(segs.map(function (s) { return s.category_id })).toEqual([11, 31])
    expect(segs[0].pct).toBeCloseTo(0.6)
  })
})

describe('sectorAtPoint —— 点圆环落在哪个扇区', () => {
  const SEGS = donutSegments([
    { category_id: 1, name: 'a', color: '#ff8a65', cents: 50 },
    { category_id: 2, name: 'b', color: '#4fc3f7', cents: 50 }
  ])

  it('角度约定：起点在正上方、顺时针递增（与 conic-gradient 一致）', () => {
    // 正上 → 0% → 第一个扇区
    expect(sectorAtPoint(SEGS, 0, -80, 100).category_id).toBe(1)
    // 正右 → 25% → 仍在第一个扇区（0~50%）
    expect(sectorAtPoint(SEGS, 80, 0, 100).category_id).toBe(1)
    // 正下 → 50% → 进入第二个扇区
    expect(sectorAtPoint(SEGS, 0, 80, 100).category_id).toBe(2)
    // 正左 → 75% → 第二个扇区
    expect(sectorAtPoint(SEGS, -80, 0, 100).category_id).toBe(2)
  })

  it('内圈留白不算扇区（那里放的是合计数字，不是环）', () => {
    expect(DONUT_HOLE_RATIO).toBe(0.5)
    expect(sectorAtPoint(SEGS, 0, 0, 100)).toBeNull()
    expect(sectorAtPoint(SEGS, 10, 10, 100)).toBeNull()
    // 恰好压在内圈边界上算命中环（阈值是严格小于）
    expect(sectorAtPoint(SEGS, 0, -50, 100)).not.toBeNull()
  })

  it('环外不命中（贴着环点不会误选）', () => {
    expect(sectorAtPoint(SEGS, 0, -120, 100)).toBeNull()
    expect(sectorAtPoint(SEGS, 130, 130, 100)).toBeNull()
  })

  it('没有扇区 / 半径非法时返回 null，不抛错', () => {
    expect(sectorAtPoint([], 0, -80, 100)).toBeNull()
    expect(sectorAtPoint(null, 0, -80, 100)).toBeNull()
    expect(sectorAtPoint(SEGS, 0, -80, 0)).toBeNull()
    expect(sectorAtPoint(SEGS, 0, -80, -5)).toBeNull()
  })

  it('脏坐标当 0 处理（不产生 NaN 命中）', () => {
    expect(sectorAtPoint(SEGS, undefined, undefined, 100)).toBeNull()
  })
})

describe('prevPeriodRange —— 环比要跟"上一个同长度期间"比', () => {
  it('日 → 昨天', () => {
    const [s, e] = prevPeriodRange('day', at(2026, 9, 27, 15))
    expect(s).toBe(at(2026, 9, 26, 0))
    expect(e).toBe(at(2026, 9, 27, 0))
  })

  it('周 → 上周（9/27 所在周从 9/21 起，上一周从 9/14 起）', () => {
    const [s, e] = prevPeriodRange('week', at(2026, 9, 27))
    expect(s).toBe(at(2026, 9, 14, 0))
    expect(e).toBe(at(2026, 9, 21, 0))
  })

  it('月 → 上月', () => {
    const [s, e] = prevPeriodRange('month', at(2026, 9, 27))
    expect(s).toBe(new Date(2026, 7, 1).getTime())
    expect(e).toBe(new Date(2026, 8, 1).getTime())
  })

  it('1 月的上一个月要落到去年 12 月（跨年不做手工进位）', () => {
    const [s, e] = prevPeriodRange('month', at(2026, 1, 15))
    expect(s).toBe(new Date(2025, 11, 1).getTime())
    expect(e).toBe(new Date(2026, 0, 1).getTime())
  })

  it('年 → 去年整年', () => {
    const [s, e] = prevPeriodRange('year', at(2026, 9, 27))
    expect([s, e]).toEqual(yearRange(2025))
  })

  it('未知 key 兜底为月（与 periodRange 的兜底口径一致）', () => {
    const [s] = prevPeriodRange('whatever', at(2026, 9, 27))
    expect(s).toBe(new Date(2026, 7, 1).getTime())
  })
})

describe('momOf —— 环比（圆心那只箭头）', () => {
  it('支出变多用 ↑（警示方向）', () => {
    const r = momOf(1200, 1000)
    expect(r.dir).toBe('up')
    expect(r.pct).toBe(20)
    expect(r.text).toBe('↑20%')
  })

  it('支出变少用 ↓', () => {
    const r = momOf(800, 1000)
    expect(r.dir).toBe('down')
    expect(r.text).toBe('↓20%')
  })

  it('完全一样显示"持平"', () => {
    const r = momOf(1000, 1000)
    expect(r.dir).toBe('flat')
    expect(r.text).toBe('持平')
  })

  it('上期为 0 时不给百分比 —— 没有基准就不该编一个"↑100%"', () => {
    const r = momOf(500, 0)
    expect(r.dir).toBe('none')
    expect(r.text).toBe('')
  })

  it('有变化但不足 1% 时至少显示 1%（不出现读起来像没变的"↑0%"）', () => {
    expect(momOf(1001, 1000).text).toBe('↑1%')
  })

  it('本期为 0（这期没花钱）是正常的 ↓100%', () => {
    expect(momOf(0, 1000).text).toBe('↓100%')
  })

  it('涨幅超过 999% 时封顶 —— 圆心放不下"↑102907%"这种数，也没信息量', () => {
    const r = momOf(12345678, 12000)
    expect(r.dir).toBe('up')
    expect(r.text).toBe('↑999%+')
    expect(r.pct).toBeGreaterThan(999) // 真实比例仍然保留在 pct 里，界面才做展示裁剪
  })

  it('脏入参不抛错', () => {
    expect(momOf(null, null).dir).toBe('none')
    expect(momOf('abc', 100).dir).toBe('down')
  })

  it('文案与期间的对照名配套', () => {
    expect(momLabelOf('day')).toBe('较昨日')
    expect(momLabelOf('week')).toBe('较上周')
    expect(momLabelOf('month')).toBe('较上月')
    expect(momLabelOf('year')).toBe('较去年')
  })
})

describe('pctText / filterByCategoryIds —— 占比文案与明细筛选', () => {
  it('占比四舍五入成整数百分比', () => {
    expect(pctText(0.4637)).toBe('46%')
    expect(pctText(1)).toBe('100%')
    expect(pctText(0)).toBe('0%')
    expect(pctText(null)).toBe('0%')
    expect(pctText(-1)).toBe('0%')
  })

  it('没传筛选条件时原样返回（"不筛"不等于"筛出空"）', () => {
    const rs = [{ category_id: 1 }, { category_id: 2 }]
    expect(filterByCategoryIds(rs, null)).toBe(rs)
    expect(filterByCategoryIds(rs, [])).toBe(rs)
  })

  it('传了分类就只留这些分类的记录（容错字符串 id）', () => {
    const rs = [{ category_id: 1 }, { category_id: '2' }, { category_id: 3 }]
    expect(filterByCategoryIds(rs, [2]).map(function (r) { return r.category_id }))
      .toEqual(['2'])
  })

  it('空入参不抛错', () => {
    expect(filterByCategoryIds(null, [1])).toEqual([])
    expect(filterByCategoryIds([{ category_id: 1 }, null], [1]).length).toBe(1)
  })
})
