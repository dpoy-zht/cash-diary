import { describe, it, expect } from 'vitest'
import { formAfterSaved, clampFutureDate, minSelectableDate } from '../src/utils/entry.js'

describe('entry / 连续记账的表单收敛（T3.1）', () => {
  it('清空金额与备注，保留类型/分类/日期', function () {
    const next = formAfterSaved({
      type: 'income',
      categoryId: 7,
      dateStr: '2026-09-20'
    })
    expect(next.amount).toBe('')
    expect(next.note).toBe('')
    expect(next.type).toBe('income')
    expect(next.categoryId).toBe(7)
    expect(next.dateStr).toBe('2026-09-20')
  })

  it('categoryId 为 0 这类合法值时原样保留，不被当成空值抹掉', function () {
    const next = formAfterSaved({ type: 'expense', categoryId: 0, dateStr: '2026-09-20' })
    expect(next.categoryId).toBe(0)
  })

  it('缺省入参不抛异常，categoryId 兜底为 null', function () {
    expect(function () { formAfterSaved() }).not.toThrow()
    const next = formAfterSaved(null)
    expect(next.categoryId).toBe(null)
    expect(next.amount).toBe('')
    expect(next.note).toBe('')
  })

  it('未传字段不臆造：type/dateStr 保持 undefined，页面自行保留原值', function () {
    const next = formAfterSaved({})
    expect(next.type).toBe(undefined)
    expect(next.dateStr).toBe(undefined)
  })
})

describe('entry / 未来日期拦截（T3.3）', () => {
  const TODAY = '2026-09-29'

  it('未来日期被钳到今天', function () {
    expect(clampFutureDate('2026-09-30', TODAY)).toBe(TODAY)
    expect(clampFutureDate('2027-01-01', TODAY)).toBe(TODAY)
    expect(clampFutureDate('2026-10-01', TODAY)).toBe(TODAY)
  })

  it('今天与过去的日期原样返回', function () {
    expect(clampFutureDate(TODAY, TODAY)).toBe(TODAY)
    expect(clampFutureDate('2026-09-28', TODAY)).toBe('2026-09-28')
    expect(clampFutureDate('2020-01-01', TODAY)).toBe('2020-01-01')
  })

  it('空值/非字符串回落到今天，不产生非法日期', function () {
    expect(clampFutureDate('', TODAY)).toBe(TODAY)
    expect(clampFutureDate(null, TODAY)).toBe(TODAY)
    expect(clampFutureDate(undefined, TODAY)).toBe(TODAY)
  })

  it('跨年边界按时间序而非纯数字序判断', function () {
    expect(clampFutureDate('2026-12-31', '2026-12-31')).toBe('2026-12-31')
    expect(clampFutureDate('2027-01-01', '2026-12-31')).toBe('2026-12-31')
    expect(clampFutureDate('2026-12-30', '2026-12-31')).toBe('2026-12-30')
  })

  it('缺省基准时用本机今天，返回值形如 YYYY-MM-DD', function () {
    const out = clampFutureDate('2999-01-01')
    expect(/^\d{4}-\d{2}-\d{2}$/.test(out)).toBe(true)
    expect(out < '2999-01-01').toBe(true)
  })

  it('可选下界默认往前 5 年', function () {
    expect(minSelectableDate('2026-09-29')).toBe('2021-09-29')
    expect(minSelectableDate('2026-09-29', 1)).toBe('2025-09-29')
    expect(/^\d{4}-\d{2}-\d{2}$/.test(minSelectableDate('2026-01-01'))).toBe(true)
  })
})
