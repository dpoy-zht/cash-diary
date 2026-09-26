import { describe, it, expect } from 'vitest'
import {
  expenseByCategory,
  donutSegments,
  conicGradient,
  balanceCents,
  streakDays,
  levelOf
} from '../src/utils/stats.js'

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
