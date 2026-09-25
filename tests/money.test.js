import { describe, it, expect } from 'vitest'
import {
  parseAmountToCents,
  formatCents,
  formatSigned,
  keypadInput,
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

describe('keypadInput —— 键盘输入状态机', () => {
  it('普通数字追加', () => {
    expect(keypadInput('', '1')).toBe('1')
    expect(keypadInput('1', '9')).toBe('19')
    expect(keypadInput('0', '5')).toBe('05')
  })

  it('小数点规则：首个自动补 0，重复无效，最多两位小数', () => {
    expect(keypadInput('', '.')).toBe('0.')
    expect(keypadInput('1', '.')).toBe('1.')
    expect(keypadInput('1.5', '.')).toBe('1.5')
    expect(keypadInput('1.5', '5')).toBe('1.55')
    expect(keypadInput('1.55', '5')).toBe('1.55') // 第 3 位小数被拒
  })

  it('退格', () => {
    expect(keypadInput('19', 'del')).toBe('1')
    expect(keypadInput('', 'del')).toBe('')
  })

  it('整数位上限 9 位', () => {
    expect(keypadInput('123456789', '9')).toBe('123456789')
    expect(keypadInput('12345678', '9')).toBe('123456789')
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
