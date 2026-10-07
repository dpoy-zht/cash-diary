import { describe, it, expect } from 'vitest'
import {
  CATEGORY_TINTS,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_ICON_GROUPS,
  tintOf,
  colorOf,
  tagColorOf,
  iconMaskStyle
} from '../src/utils/palette.js'
import {
  DEFAULT_CATEGORIES, iconOptions, EXPENSE_TREE,
  DEFAULT_CATEGORY_COUNT, DEFAULT_EXPENSE_COUNT, DEFAULT_INCOME_COUNT
} from '../src/services/category.js'

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

  it('支出一级 + 二级树，收入 8 个平铺（v7 两级体系）', () => {
    expect(expense.length).toBe(DEFAULT_EXPENSE_COUNT)
    expect(income.length).toBe(DEFAULT_INCOME_COUNT)
    expect(DEFAULT_CATEGORIES.length).toBe(DEFAULT_CATEGORY_COUNT)
    // 收入保持平铺：全部没有父级
    expect(income.every(function (c) { return c.parentName === null })).toBe(true)
    // 支出一级数量 == 事实源的一级数量
    const tops = expense.filter(function (c) { return c.parentName === null })
    expect(tops.length).toBe(EXPENSE_TREE.length)
  })

  it('每个二级都能在事实源里找到它的父级（parentName 不是凭空写的）', () => {
    const topNames = DEFAULT_CATEGORIES
      .filter(function (c) { return c.parentName === null })
      .map(function (c) { return c.name })
    DEFAULT_CATEGORIES
      .filter(function (c) { return c.parentName !== null })
      .forEach(function (c) {
        expect(topNames, c.name + ' 的父级不在清单里').toContain(c.parentName)
      })
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

  it('sort 是**组内**连续编号：一级 1..n；每个一级下的二级各自 1..m；收入 1..n', () => {
    const tops = expense.filter(function (c) { return c.parentName === null })
    expect(tops.map(function (c) { return c.sort }))
      .toEqual(Array.from({ length: tops.length }, function (_v, i) { return i + 1 }))
    EXPENSE_TREE.forEach(function (p) {
      const kids = expense.filter(function (c) { return c.parentName === p.name })
      expect(kids.map(function (c) { return c.sort }), p.name)
        .toEqual(Array.from({ length: kids.length }, function (_v, i) { return i + 1 }))
    })
    expect(income.map(function (c) { return c.sort }))
      .toEqual(Array.from({ length: income.length }, function (_v, i) { return i + 1 }))
  })

  it('内置分类的图标都在本类型的可选清单里（过滤器不会把既有图标藏起来）', () => {
    DEFAULT_CATEGORIES.forEach(function (c) {
      expect(iconOptions(c.type), c.name + ' / ' + c.icon).toContain(c.icon)
    })
  })
})

describe('CATEGORY_ICON_GROUPS —— 图标语义分组（T3.4）', () => {
  function grouped() {
    return []
      .concat(CATEGORY_ICON_GROUPS.common)
      .concat(CATEGORY_ICON_GROUPS.expense)
      .concat(CATEGORY_ICON_GROUPS.income)
  }

  it('19 个图标全部被分组覆盖，没有"永远选不到"的图标', () => {
    const g = grouped()
    Object.keys(CATEGORY_ICONS).forEach(function (k) {
      expect(g.indexOf(k), k + ' 未被任何分组覆盖').toBeGreaterThan(-1)
    })
  })

  it('分组里的 key 都有图标定义，且不重复', () => {
    const g = grouped()
    expect(new Set(g).size).toBe(g.length)
    g.forEach(function (k) {
      expect(CATEGORY_ICONS[k], k + ' 没有图标定义').toBeTruthy()
    })
  })

  it('收入图标不进支出组，反之亦然；「其他」为两类共用', () => {
    expect(CATEGORY_ICON_GROUPS.expense).not.toContain('salary')
    expect(CATEGORY_ICON_GROUPS.expense).not.toContain('redbag')
    expect(CATEGORY_ICON_GROUPS.income).not.toContain('milktea')
    expect(CATEGORY_ICON_GROUPS.income).not.toContain('taxi')
    expect(CATEGORY_ICON_GROUPS.common).toEqual(['more'])
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

describe('T5.1 —— tagColorOf（标签取色）', () => {
  it('c1..c8 映射到 CATEGORY_TINTS 的对应项', () => {
    expect(tagColorOf({ id: 99, color: 'c1' })).toBe(CATEGORY_TINTS[0])
    expect(tagColorOf({ id: 99, color: 'c8' })).toBe(CATEGORY_TINTS[7])
  })

  it('色 key 认不出（空串 / 脏值 / 越界）时按 id 取稳定色，永远有颜色可用', () => {
    expect(tagColorOf({ id: 3, color: '' })).toBe(tintOf(3))
    expect(tagColorOf({ id: 3, color: 'nope' })).toBe(tintOf(3))
    expect(tagColorOf({ id: 3, color: 'c9' })).toBe(tintOf(3))
    expect(tagColorOf({ id: 3 })).toBe(tintOf(3))
    expect(typeof tagColorOf(null)).toBe('string')
  })

  it('色 key 优先于 id：同一个 id 换色即换色（不依赖 id 兜底）', () => {
    expect(tagColorOf({ id: 1, color: 'c5' })).not.toBe(tagColorOf({ id: 1, color: 'c6' }))
  })
})
