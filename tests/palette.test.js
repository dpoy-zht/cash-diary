import { describe, it, expect } from 'vitest'
import { CATEGORY_TINTS, tintOf } from '../src/utils/palette.js'
import { DEFAULT_CATEGORIES } from '../src/services/category.js'

describe('tintOf —— 分类底色（纯展示层）', () => {
  it('底色表为 8 个合法十六进制色，且互不重复', () => {
    expect(CATEGORY_TINTS.length).toBe(8)
    CATEGORY_TINTS.forEach(function (hex) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    })
    expect(new Set(CATEGORY_TINTS).size).toBe(CATEGORY_TINTS.length)
  })

  it('相同 id 永远得到相同底色（列表与宫格颜色一致的前提）', () => {
    expect(tintOf(3)).toBe(tintOf(3))
    expect(tintOf('3')).toBe(tintOf(3))
    expect(tintOf(11)).toBe(tintOf(11))
  })

  it('按 id 循环取色，越过一轮后回到起点', () => {
    expect(tintOf(1)).toBe(CATEGORY_TINTS[0])
    expect(tintOf(8)).toBe(CATEGORY_TINTS[7])
    expect(tintOf(9)).toBe(CATEGORY_TINTS[0])
    expect(tintOf(12)).toBe(CATEGORY_TINTS[3])
  })

  it('内置分类落在各自列表内时互不撞色（支出 8 项 / 收入 4 项）', () => {
    // 种子写入顺序即 id 顺序：前 8 个为支出（id 1..8），后 4 个为收入（id 9..12）
    const expense = DEFAULT_CATEGORIES.filter(function (c) { return c.type === 'expense' })
    const income = DEFAULT_CATEGORIES.filter(function (c) { return c.type === 'income' })
    expect(expense.length).toBe(8)
    expect(income.length).toBe(4)

    const expenseTints = expense.map(function (c, i) { return tintOf(i + 1) })
    const incomeTints = income.map(function (c, i) { return tintOf(i + 9) })
    expect(new Set(expenseTints).size).toBe(8)
    expect(new Set(incomeTints).size).toBe(4)
  })

  it('非法入参回落到第一个色，不抛错', () => {
    expect(tintOf(null)).toBe(CATEGORY_TINTS[0])
    expect(tintOf(undefined)).toBe(CATEGORY_TINTS[0])
    expect(tintOf('abc')).toBe(CATEGORY_TINTS[0])
    expect(tintOf(NaN)).toBe(CATEGORY_TINTS[0])
  })

  it('负数与小数不越界', () => {
    expect(CATEGORY_TINTS).toContain(tintOf(-3))
    expect(CATEGORY_TINTS).toContain(tintOf(7.9))
  })
})
