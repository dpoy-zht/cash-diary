import { describe, it, expect } from 'vitest'
import {
  formAfterSaved,
  clampFutureDate,
  minSelectableDate,
  sanitizeAmountInput
} from '../src/utils/entry.js'
import { parseAmountToCents } from '../src/utils/money.js'

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

describe('entry / 金额输入约束（编辑弹层，回归：type=digit 改不动金额）', () => {
  /**
   * 背景：编辑弹层的金额框原来写 `type="digit"`，uni-app 会把它渲染成
   * `<input type="number">`。浏览器对 number 输入框的「输入中间态」（如 '7.'）
   * 判无效并清空，uni-app 内部的 resolveDigitDecimalPoint 补丁还会在 blur 时
   * 把小数点削掉 —— 真机上表现为「编辑记录时金额改不动、小数点输不进去」。
   * 现在改成 type="text" + inputmode="decimal"，约束由 sanitizeAmountInput 把守。
   */
  it('数字与小数点原样通过（含正在输入的尾巴上的点）', () => {
    expect(sanitizeAmountInput('7')).toBe('7')
    expect(sanitizeAmountInput('7.')).toBe('7.')
    expect(sanitizeAmountInput('7.5')).toBe('7.5')
    expect(sanitizeAmountInput('0.05')).toBe('0.05')
    expect(sanitizeAmountInput('')).toBe('')
  })

  it('非数字字符一律剥掉（粘贴、手滑、桌面端全键盘都能打进来）', () => {
    expect(sanitizeAmountInput('7a5')).toBe('75')
    expect(sanitizeAmountInput('¥75.00')).toBe('75.00')
    expect(sanitizeAmountInput('-75')).toBe('75')
    expect(sanitizeAmountInput(' 7 5 ')).toBe('75')
    expect(sanitizeAmountInput('abc')).toBe('')
  })

  it('只保留第一个小数点', () => {
    expect(sanitizeAmountInput('7.5.5')).toBe('7.55')
    expect(sanitizeAmountInput('..')).toBe('.')
    expect(sanitizeAmountInput('7..5')).toBe('7.5')
  })

  it('整数最多 9 位、小数最多 2 位（与 parseAmountToCents 同口径）', () => {
    expect(sanitizeAmountInput('1234567890')).toBe('123456789')
    expect(sanitizeAmountInput('7.555')).toBe('7.55')
    expect(sanitizeAmountInput('1234567890.99')).toBe('123456789.99')
  })

  it('净化结果必须都能被 parseAmountToCents 接受（除了空与纯点）', () => {
    const samples = ['7', '7.', '7.5', '0.05', '75.00', '123456789', '123456789.99', '']
    samples.forEach(function (s) {
      const clean = sanitizeAmountInput(s)
      if (clean === '' || clean === '.') {
        expect(parseAmountToCents(clean)).toBe(null)
      } else {
        // '7.' 这类尾巴带点的由页面保存前再削一次，这里先确认剥掉点后一定能解析
        expect(parseAmountToCents(clean.replace(/\.$/, ''))).not.toBe(null)
      }
    })
  })

  it('null / undefined 不抛异常', () => {
    expect(sanitizeAmountInput(null)).toBe('')
    expect(sanitizeAmountInput(undefined)).toBe('')
  })
})
