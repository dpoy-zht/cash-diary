import { describe, it, expect } from 'vitest'
import {
  CATEGORY_TINTS,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  tintOf,
  colorOf,
  iconMaskStyle
} from '../src/utils/palette.js'
import { DEFAULT_CATEGORIES } from '../src/services/category.js'

describe('tintOf —— 兜底底色（纯展示层）', () => {
  it('兜底表为 8 个合法十六进制色，且互不重复', () => {
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

describe('内置分类与 v2.0 参考包对齐', () => {
  const expense = DEFAULT_CATEGORIES.filter(function (c) { return c.type === 'expense' })
  const income = DEFAULT_CATEGORIES.filter(function (c) { return c.type === 'income' })

  it('12 个支出 + 8 个收入 = 20 个（对齐参考包的分类体系）', () => {
    expect(expense.length).toBe(12)
    expect(income.length).toBe(8)
    expect(DEFAULT_CATEGORIES.length).toBe(20)
  })

  it('每个分类都有配色与 SVG 图标，不会有分类退回 emoji', () => {
    DEFAULT_CATEGORIES.forEach(function (c) {
      expect(CATEGORY_COLORS[c.icon], c.name + ' 缺配色').toBeTruthy()
      expect(CATEGORY_ICONS[c.icon], c.name + ' 缺图标').toBeTruthy()
    })
  })

  it('分类名可以重名，但 key 必须唯一', () => {
    // 支出与收入里都有「红包」「其他」——所以取色只能按 icon key，不能按名字
    const names = DEFAULT_CATEGORIES.map(function (c) { return c.name })
    expect(names.filter(function (n) { return n === '红包' }).length).toBe(2)
    expect(names.filter(function (n) { return n === '其他' }).length).toBe(2)
    // 同名但 key 不同，因而图标不同、不会互相覆盖
    expect(CATEGORY_ICONS.gift).not.toBe(CATEGORY_ICONS.redbag)
  })

  it('分类 id 由种子写入顺序决定，type 与 sort 不乱', () => {
    expect(expense.map(function (c) { return c.sort })).toEqual(
      Array.from({ length: 12 }, function (_v, i) { return i + 1 })
    )
    expect(income.map(function (c) { return c.sort })).toEqual(
      Array.from({ length: 8 }, function (_v, i) { return i + 1 })
    )
  })
})

describe('colorOf —— 按 icon key 取严格配色', () => {
  it('命中 key 时返回参考包的严格色', () => {
    expect(colorOf({ name: '早餐', icon: 'breakfast' })).toBe('#ff8a65')
    expect(colorOf({ name: '购物', icon: 'shop' })).toBe('#ffc93c')
    expect(colorOf({ name: '工资', icon: 'salary' })).toBe('#aed581')
  })

  it('同名不同 key 能各取各的（重名不再撞车）', () => {
    // 参考包里支出红包(gift) 与收入红包(redbag) 同色，但图标不同
    expect(colorOf({ name: '红包', icon: 'gift' })).toBe('#ef5350')
    expect(colorOf({ name: '红包', icon: 'redbag' })).toBe('#ef5350')
    expect(iconMaskStyle({ icon: 'gift' })).not.toEqual(iconMaskStyle({ icon: 'redbag' }))
  })

  it('老数据（icon 存 emoji）回落到按 id 轮换的兜底色', () => {
    expect(colorOf({ id: 1, name: '餐饮', icon: '🍜' })).toBe(CATEGORY_TINTS[0])
    expect(colorOf({ id: 9, name: '工资', icon: '💼' })).toBe(CATEGORY_TINTS[0])
  })

  it('空对象不抛错', () => {
    expect(CATEGORY_TINTS).toContain(colorOf({}))
    expect(CATEGORY_TINTS).toContain(colorOf(null))
  })
})

describe('iconMaskStyle —— 白色图标的 mask 样式', () => {
  it('命中 key 时返回 mask 样式（含 mask-image）', () => {
    const style = iconMaskStyle({ icon: 'lunch' })
    expect(style).toBeTruthy()
    expect(style['mask-image']).toContain('data:image/svg+xml')
  })

  it('老数据取不到图标时返回 null，交给调用方退回 emoji', () => {
    expect(iconMaskStyle({ icon: '🍜' })).toBeNull()
    expect(iconMaskStyle({ icon: '' })).toBeNull()
    expect(iconMaskStyle({})).toBeNull()
    expect(iconMaskStyle(null)).toBeNull()
  })
})
