import { describe, it, expect, afterEach } from 'vitest'
import {
  parseAmountToCents,
  formatCents,
  formatSigned,
  groupThousands,
  displayAmount,
  compactYuan,
  amountSizeClass,
  COMPACT_FROM_LEN
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

/**
 * 余额卡大数字的紧凑写法与字号分档（2026-10-08）。
 *
 * 起因：vivo iQOO 12/OriginOS 用户截图里首页「已花」被截成「¥22⋯」，
 * 同页流水却明明是 ¥225.00。实测那列只有 100~130px 可用，
 * 28px 的 7 字符就要 104px —— 系统字体一大必截断。
 */
describe('compactYuan —— 金额紧凑写法', () => {
  it('0 → ¥0', () => {
    expect(compactYuan(0)).toBe('¥0')
    expect(compactYuan(null)).toBe('¥0')
    expect(compactYuan(-100)).toBe('¥0')
  })

  it('不到 1 万显示整数元（不带小数）', () => {
    expect(compactYuan(22500)).toBe('¥225')
    expect(compactYuan(123400)).toBe('¥1,234')
    expect(compactYuan(999900)).toBe('¥9,999')
  })

  it('四舍五入到元（¥9999.99 → ¥10,000），不是截断', () => {
    expect(compactYuan(999999)).toBe('¥10,000')
  })

  it('过万走「万」，一位小数', () => {
    expect(compactYuan(1234567)).toBe('¥1.2万')
    expect(compactYuan(12345678)).toBe('¥12.3万')
  })

  it('比 formatCents 明显更短（这才是它存在的意义）', () => {
    const long = 12345678
    expect(formatCents(long).length).toBeGreaterThan(compactYuan(long).length)
  })
})

describe('amountSizeClass —— 大数字字号档位', () => {
  it('≤6 字符保持默认 28px（设计主角不降档）', () => {
    expect(amountSizeClass('0.00')).toBe('')     // 4
    expect(amountSizeClass('225.00')).toBe('')    // 6  ← 用户截图那个金额，够短
    expect(amountSizeClass('9,999')).toBe('')     // 5
  })

  it('7~8 字符降一档', () => {
    expect(amountSizeClass('1225.00')).toBe('md')  // 7
    expect(amountSizeClass('1,225.00')).toBe('md') // 8
  })

  it('≥9 字符降到 sm', () => {
    expect(amountSizeClass('12,345.67')).toBe('sm')  // 9
    expect(amountSizeClass('123,456.78')).toBe('sm') // 10
  })

  it('空/非法输入不炸', () => {
    expect(amountSizeClass(null)).toBe('')
    expect(amountSizeClass('')).toBe('')
    expect(amountSizeClass(undefined)).toBe('')
  })

  it('阈值和紧凑写法衔接得上：超过阈值就换成更短的文本', () => {
    // COMPACT_FROM_LEN 以上走 compactYuan，compactYuan 的结果必然落回 ≤8 字符
    expect(COMPACT_FROM_LEN).toBe(9)
    const compact = compactYuan(123456789).replace(/^¥/, '')
    expect(compact.length).toBeLessThan(COMPACT_FROM_LEN)
    expect(amountSizeClass(compact)).not.toBe('sm')
  })
})
