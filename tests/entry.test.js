import { describe, it, expect } from 'vitest'
import { formAfterSaved } from '../src/utils/entry.js'

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
