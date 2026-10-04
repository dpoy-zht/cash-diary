import { describe, it, expect, afterEach } from 'vitest'
import {
  parseAmountToCents,
  formatCents,
  formatSigned,
  groupThousands,
  displayAmount
} from '../src/utils/money.js'

describe('parseAmountToCents —— 金额一律整数分，禁止浮点存储', () => {
  it('正常金额换算正确', () => {
    expect(parseAmountToCents('19.9')).toBe(1990)
    expect(parseAmountToCents('19.90')).toBe(1990)
    expect(parseAmountToCents('0.01')).toBe(1)
    expect(parseAmountToCents('8500')).toBe(850000)
    expect(parseAmountToCents('999999999.99')).toBe(99999999999)
  })

  it('消除浮点误差：0.1 + 0.2 场景在分域内精确', () => {
    const a = parseAmountToCents('0.1')
    const b = parseAmountToCents('0.2')
    expect(a + b).toBe(30) // 而不是 0.30000000000000004
  })

  it('非法输入一律返回 null', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('1.234')).toBeNull() // 超过 2 位小数
    expect(parseAmountToCents('-5')).toBeNull()
    expect(parseAmountToCents('0')).toBeNull()
    expect(parseAmountToCents('0.00')).toBeNull()
    expect(parseAmountToCents('1234567890')).toBeNull() // 超过 9 位整数
    expect(parseAmountToCents(null)).toBeNull()
    expect(parseAmountToCents(1990)).toBeNull() // 只接受字符串
  })
})

describe('formatCents / formatSigned —— 千分位两位小数，红支绿收', () => {
  it('千分位与两位小数', () => {
    expect(formatCents(1990)).toBe('19.90')
    expect(formatCents(1)).toBe('0.01')
    expect(formatCents(180000)).toBe('1,800.00')
    expect(formatCents(850000)).toBe('8,500.00')
  })

  it('符号：支出 -、收入 +', () => {
    expect(formatSigned(1990, 'expense')).toBe('-¥19.90')
    expect(formatSigned(850000, 'income')).toBe('+¥8,500.00')
  })
})

describe('金额展示不得依赖 Intl —— 真机上 App 的 JS 引擎没有 Intl', () => {
  // 真机实测（Android 16 / 小米 14 Pro）：typeof Intl === 'undefined'，
  // (1800).toLocaleString('zh-CN', {minimumFractionDigits:2}) 返回 '1800' 而不是
  // '1,800.00' —— options 被整个丢掉。原实现直接吃这个返回值，导致首页渲染出
  // 「已花 ¥1800」。H5 有完整 ICU，所以浏览器预览和 H5 截图都看不出来。
  // 这里把 toLocaleString 换成真机上那种「忽略参数」的行为，锁死回归。
  const realToLocaleString = Number.prototype.toLocaleString
  afterEach(function () {
    Number.prototype.toLocaleString = realToLocaleString
  })

  it('toLocaleString 忽略 options（真机行为）时，千分位与两位小数仍然正确', () => {
    Number.prototype.toLocaleString = function () { return String(this) }
    expect(formatCents(180000)).toBe('1,800.00')
    expect(formatCents(1990)).toBe('19.90')
    expect(formatCents(1)).toBe('0.01')
    expect(formatCents(0)).toBe('0.00')
    expect(formatCents(123456789)).toBe('1,234,567.89')
    expect(formatSigned(180000, 'expense')).toBe('-¥1,800.00')
    expect(displayAmount('1990')).toBe('1,990')
    expect(displayAmount('1234567')).toBe('1,234,567')
  })

  it('groupThousands：三位一组，取绝对值（符号由调用方给）', () => {
    expect(groupThousands(0)).toBe('0')
    expect(groupThousands(7)).toBe('7')
    expect(groupThousands(999)).toBe('999')
    expect(groupThousands(1000)).toBe('1,000')
    expect(groupThousands(12345)).toBe('12,345')
    expect(groupThousands(1234567)).toBe('1,234,567')
    expect(groupThousands(-1234)).toBe('1,234')
  })

  it('formatCents：负数带 - 号', () => {
    expect(formatCents(-1234)).toBe('-12.34')
    expect(formatCents(-180000)).toBe('-1,800.00')
  })

  it('formatCents：非法输入退回 0.00，不吐 NaN', () => {
    expect(formatCents(NaN)).toBe('0.00')
    expect(formatCents(undefined)).toBe('0.00')
    expect(formatCents(null)).toBe('0.00')
    expect(formatCents('abc')).toBe('0.00')
    expect(formatCents(Infinity)).toBe('0.00')
  })
})

describe('displayAmount —— 记账页大数字展示', () => {
  it('空值显示 0.00', () => {
    expect(displayAmount('')).toBe('0.00')
    expect(displayAmount('0')).toBe('0')
  })
  it('千分位但不补齐小数', () => {
    expect(displayAmount('1234567')).toBe('1,234,567')
    expect(displayAmount('19.9')).toBe('19.9')
  })
})
