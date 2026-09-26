import { describe, it, expect } from 'vitest'
import {
  expenseByCategory,
  donutSegments,
  conicGradient,
  balanceCents
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
