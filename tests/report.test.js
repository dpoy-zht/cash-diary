import { describe, it, expect } from 'vitest'
import {
  buildMonthlyReport,
  monthOverMonth,
  dailyExpense,
  biggestOf,
  TOP_N
} from '../src/utils/report.js'

function at(y, mo, d, h) {
  return new Date(y, mo - 1, d, h == null ? 12 : h, 0, 0).getTime()
}

/** 造一条流水（默认当月有效、未删除） */
function tx(o) {
  return Object.assign(
    {
      id: 1,
      account_id: 1,
      category_id: 1,
      type: 'expense',
      amount_cents: 100,
      note: '',
      occurred_at: at(2026, 9, 10),
      deleted_at: null
    },
    o
  )
}

/** 与内置分类里 id 对应的最小分类表（name/icon 够用即可） */
const CATS = [
  { id: 1, name: '早餐', icon: 'breakfast', type: 'expense' },
  { id: 2, name: '午餐', icon: 'lunch', type: 'expense' },
  { id: 3, name: '打车', icon: 'taxi', type: 'expense' },
  { id: 4, name: '购物', icon: 'shop', type: 'expense' },
  { id: 5, name: '娱乐', icon: 'fun', type: 'expense' },
  { id: 6, name: '住房', icon: 'home', type: 'expense' },
  { id: 7, name: '工资', icon: 'salary', type: 'income' }
]

describe('T4.4 —— 环比 monthOverMonth', () => {
  it('涨 / 跌 / 持平', () => {
    const up = monthOverMonth(12000, 10000)
    expect(up.dir).toBe('up')
    expect(up.diffCents).toBe(2000)
    expect(up.pct).toBe(20)

    const down = monthOverMonth(8000, 10000)
    expect(down.dir).toBe('down')
    expect(down.pct).toBe(-20)

    const flat = monthOverMonth(10000, 10000)
    expect(flat.dir).toBe('flat')
    expect(flat.pct).toBe(0)
  })

  it('小数百分比保留一位（不四舍五入成整数）', () => {
    expect(monthOverMonth(11230, 10000).pct).toBe(12.3)
  })

  it('上期为 0 时 pct 是 null（除零），但方向仍然明确', () => {
    const fromZero = monthOverMonth(5000, 0)
    expect(fromZero.pct).toBeNull()
    expect(fromZero.dir).toBe('up')
    expect(fromZero.prevCents).toBe(0)

    const bothZero = monthOverMonth(0, 0)
    expect(bothZero.pct).toBeNull()
    expect(bothZero.dir).toBe('flat')
  })

  it('脏值当 0 处理，不会算出 NaN', () => {
    expect(monthOverMonth(undefined, undefined).curCents).toBe(0)
    expect(monthOverMonth('x', 100).curCents).toBe(0)
    expect(monthOverMonth(-5, 100).curCents).toBe(0)
  })
})

describe('T4.4 —— 逐日支出 dailyExpense', () => {
  it('只算支出、同一天累加、跳过软删除', () => {
    const rows = [
      tx({ amount_cents: 1000, occurred_at: at(2026, 9, 10, 8) }),
      tx({ amount_cents: 2000, occurred_at: at(2026, 9, 10, 20) }),
      tx({ amount_cents: 5000, occurred_at: at(2026, 9, 11), type: 'income' }), // 收入不算
      tx({ amount_cents: 9999, occurred_at: at(2026, 9, 12), deleted_at: 123 }) // 已删不算
    ]
    const m = dailyExpense(rows)
    expect(m.get(at(2026, 9, 10, 0))).toBe(3000)
    expect(m.has(at(2026, 9, 11, 0))).toBe(false)
    expect(m.has(at(2026, 9, 12, 0))).toBe(false)
  })

  it('跨天按本地日历日分桶（同一天不同时刻归一处）', () => {
    const m = dailyExpense([tx({ occurred_at: at(2026, 9, 10, 0) }), tx({ occurred_at: at(2026, 9, 10, 23) })])
    expect(m.size).toBe(1)
  })

  it('传入非数组不炸', () => {
    expect(dailyExpense(null).size).toBe(0)
    expect(dailyExpense(undefined).size).toBe(0)
  })
})

describe('T4.4 —— 最大一笔 biggestOf', () => {
  it('取金额最大的一笔，并带上分类名 / 图标 / 颜色 / 日期文案', () => {
    const rows = [
      tx({ category_id: 1, amount_cents: 3000, note: '早饭' }),
      tx({ category_id: 3, amount_cents: 30000, note: '打车去公司', occurred_at: at(2026, 9, 20) })
    ]
    const big = biggestOf(rows, 'expense', CATS)
    expect(big.cents).toBe(30000)
    expect(big.note).toBe('打车去公司')
    expect(big.name).toBe('打车')
    expect(big.icon).toBe('taxi')
    expect(big.dateText).toBe('9月20日')
  })

  it('并列时取时间较晚的那笔', () => {
    const rows = [
      tx({ amount_cents: 5000, note: '早的', occurred_at: at(2026, 9, 5) }),
      tx({ amount_cents: 5000, note: '晚的', occurred_at: at(2026, 9, 25) })
    ]
    expect(biggestOf(rows, 'expense', CATS).note).toBe('晚的')
  })

  it('只按指定类型找（收入不会串进支出的"最大一笔"）', () => {
    const rows = [tx({ amount_cents: 100, type: 'expense' }), tx({ category_id: 7, amount_cents: 900000, type: 'income' })]
    expect(biggestOf(rows, 'expense', CATS).cents).toBe(100)
    expect(biggestOf(rows, 'income', CATS).cents).toBe(900000)
  })

  it('没有记录 / 全是软删除 → null', () => {
    expect(biggestOf([], 'expense', CATS)).toBeNull()
    expect(biggestOf([tx({ deleted_at: 1 })], 'expense', CATS)).toBeNull()
  })

  it('分类查不到时退化成"其他"，不抛错', () => {
    const big = biggestOf([tx({ category_id: 999, amount_cents: 100 })], 'expense', CATS)
    expect(big.name).toBe('其他')
  })
})

describe('T4.4 —— 月度报告整体 buildMonthlyReport', () => {
  /** 九月：餐饮 30 元 + 打车 300 元；收入 12000 元；另有两条不同天 */
  const SEPT = [
    tx({ id: 1, category_id: 1, amount_cents: 3000, occurred_at: at(2026, 9, 2, 8), note: '早饭' }),
    tx({ id: 2, category_id: 3, amount_cents: 30000, occurred_at: at(2026, 9, 20, 9), note: '打车' }),
    tx({ id: 3, category_id: 7, type: 'income', amount_cents: 1200000, occurred_at: at(2026, 9, 25, 10) })
  ]
  /** 八月：只有 200 元支出、没有收入 */
  const AUG = [tx({ id: 9, category_id: 4, amount_cents: 20000, occurred_at: at(2026, 8, 15) })]

  function build(patch) {
    return buildMonthlyReport(
      Object.assign(
        { ym: '2026-09', records: SEPT, prevRecords: AUG, categories: CATS, totalBudgetCents: 0 },
        patch
      )
    )
  }

  it('收支 / 结余 / 笔数', () => {
    const r = build()
    expect(r.expenseCents).toBe(33000)
    expect(r.incomeCents).toBe(1200000)
    expect(r.balanceCents).toBe(1200000 - 33000)
    expect(r.count).toBe(3)
    expect(r.label).toBe('2026年9月')
    expect(r.prevYm).toBe('2026-08')
    expect(r.daysInMonth).toBe(30)
  })

  it('记账天数 = 有记录的本地日去重（同一天多笔只算一天）', () => {
    const r = build({
      records: SEPT.concat([tx({ id: 4, amount_cents: 100, occurred_at: at(2026, 9, 2, 21) })])
    })
    expect(r.recordDays).toBe(3) // 9/2 两笔 → 仍是 9/2、9/20、9/25 三天
  })

  it('日均支出按自然月天数摊（不是除记账天数）', () => {
    const r = build()
    expect(r.avgPerDayCents).toBe(Math.round(33000 / 30))
  })

  it('环比：支出较上月涨、收入上月为 0（pct null）', () => {
    const r = build()
    expect(r.mom.expense.dir).toBe('up')
    expect(r.mom.expense.prevCents).toBe(20000)
    expect(r.mom.expense.pct).toBe(65) // (33000-20000)/20000
    expect(r.mom.income.pct).toBeNull()
    expect(r.mom.income.dir).toBe('up')
  })

  it('分类 TOP：按金额降序、占比相对当月总支出', () => {
    const r = build()
    expect(r.topCategories.map(function (c) { return c.name })).toEqual(['打车', '早餐'])
    expect(r.topCategories[0].cents).toBe(30000)
    expect(r.topCategories[0].rank).toBe(1)
    expect(r.topCategories[0].pct).toBeCloseTo(30000 / 33000, 5)
    expect(r.topCategories[0].icon).toBe('taxi')
    expect(r.topCategories[0].color).toBeTruthy()
  })

  it('分类 TOP 最多 5 条（第 6 类被截掉）', () => {
    const many = []
    for (let i = 1; i <= 6; i += 1) {
      many.push(tx({ id: i, category_id: i, amount_cents: (7 - i) * 1000, occurred_at: at(2026, 9, i + 1) }))
    }
    const r = build({ records: many })
    expect(r.topCategories.length).toBe(TOP_N)
    expect(r.topCategories.map(function (c) { return c.cents })).toEqual([6000, 5000, 4000, 3000, 2000])
  })

  it('超支天数：未设总预算时不算（hasBudget=false，不会把正常花销判成超支）', () => {
    const r = build({ totalBudgetCents: 0 })
    expect(r.budget.hasBudget).toBe(false)
    expect(r.budget.perDayCents).toBe(0)
    expect(r.budget.overDays).toBe(0)
    expect(r.budget.overDayList).toEqual([])
  })

  it('超支天数：日均额度 = 总预算 ÷ 当月天数（向上取整），严格大于才算超', () => {
    // 900000 分 ÷ 30 天 = 30000 分/天 → 9/20 花了 30000，正好等于额度，不算超
    const r = build({ totalBudgetCents: 900000 })
    expect(r.budget.perDayCents).toBe(30000)
    expect(r.budget.overDays).toBe(0)

    // 600000 ÷ 30 = 20000 → 9/20 的 30000 超了；9/2 的 3000 没超
    const r2 = build({ totalBudgetCents: 600000 })
    expect(r2.budget.perDayCents).toBe(20000)
    expect(r2.budget.overDays).toBe(1)
    expect(r2.budget.overDayList).toEqual(['2026-09-20'])
  })

  it('超支天数：额度向上取整（不会因为除不尽而放过一分钱）', () => {
    // 100000 ÷ 31 → 3225.8 → ceil 3226
    const r = buildMonthlyReport({
      ym: '2026-10',
      records: [tx({ amount_cents: 3226, occurred_at: at(2026, 10, 5) })],
      categories: CATS,
      totalBudgetCents: 100000
    })
    expect(r.budget.perDayCents).toBe(3226)
    expect(r.budget.overDays).toBe(0) // 等于额度不算超
  })

  it('超支日期列表按时间升序（后端展示"哪几天超了"）', () => {
    const rows = [
      tx({ id: 1, amount_cents: 50000, occurred_at: at(2026, 9, 20) }),
      tx({ id: 2, amount_cents: 50000, occurred_at: at(2026, 9, 3) }),
      tx({ id: 3, amount_cents: 50000, occurred_at: at(2026, 9, 11) })
    ]
    const r = build({ records: rows, totalBudgetCents: 300000 })
    expect(r.budget.overDayList).toEqual(['2026-09-03', '2026-09-11', '2026-09-20'])
  })

  it('最大一笔：支出与收入各一条', () => {
    const r = build()
    expect(r.biggest.expense.cents).toBe(30000)
    expect(r.biggest.expense.note).toBe('打车')
    expect(r.biggest.income.cents).toBe(1200000)
    expect(r.biggest.income.name).toBe('工资')
  })

  it('软删除的记录在任何一项里都不出现', () => {
    const rows = SEPT.concat([tx({ id: 99, category_id: 5, amount_cents: 999999, occurred_at: at(2026, 9, 28), deleted_at: 1 })])
    const r = build({ records: rows })
    expect(r.expenseCents).toBe(33000)
    expect(r.count).toBe(3)
    expect(r.biggest.expense.cents).toBe(30000) // 不是那条 9999.99
    expect(r.topCategories.map(function (c) { return c.name })).not.toContain('娱乐')
  })

  it('空月份：全 0，不抛错；TOP 为空数组；最大一笔为 null', () => {
    const r = buildMonthlyReport({ ym: '2026-09', records: [], prevRecords: [], categories: CATS })
    expect(r.expenseCents).toBe(0)
    expect(r.incomeCents).toBe(0)
    expect(r.balanceCents).toBe(0)
    expect(r.count).toBe(0)
    expect(r.recordDays).toBe(0)
    expect(r.avgPerDayCents).toBe(0)
    expect(r.topCategories).toEqual([])
    expect(r.biggest.expense).toBeNull()
    expect(r.biggest.income).toBeNull()
  })

  it('月份非法 / 参数缺失时不崩：天数退化为 0，日均不产生 NaN', () => {
    const r = buildMonthlyReport({})
    expect(r.ym).toBe('')
    expect(r.daysInMonth).toBe(0)
    expect(r.avgPerDayCents).toBe(0)
    expect(Number.isFinite(r.expenseCents)).toBe(true)
  })

  it('结余为负时如实为负（这个月花超了收入）', () => {
    const r = buildMonthlyReport({
      ym: '2026-09',
      records: [tx({ amount_cents: 500000 }), tx({ amount_cents: 100000, type: 'income' })],
      categories: CATS
    })
    expect(r.balanceCents).toBe(-400000)
  })

  it('与统计页口径一致：同月同数据的 sumByType 结果相等', async () => {
    const { sumByType } = await import('../src/utils/stats.js')
    const r = build()
    const direct = sumByType(SEPT)
    expect(r.expenseCents).toBe(direct.expenseCents)
    expect(r.incomeCents).toBe(direct.incomeCents)
  })
})
