import { describe, it, expect } from 'vitest'
import { REMIND_PREF_KEY, normalizeRemindEnabled, haptic, listenPushClick } from '../src/utils/notify.js'

describe('normalizeRemindEnabled —— 记账提醒开关归一化', () => {
  it('存储键固定（me 页写入与 home 页读取必须一致）', () => {
    expect(REMIND_PREF_KEY).toBe('cashDiary.remind.enabled')
  })

  it('默认开启：没存过 / null / undefined 都视为开', () => {
    expect(normalizeRemindEnabled(undefined)).toBe(true)
    expect(normalizeRemindEnabled(null)).toBe(true)
    expect(normalizeRemindEnabled('')).toBe(true)
  })

  it('明确的"关"值才关：false / 0 / "0" / "false"', () => {
    expect(normalizeRemindEnabled(false)).toBe(false)
    expect(normalizeRemindEnabled(0)).toBe(false)
    expect(normalizeRemindEnabled('0')).toBe(false)
    expect(normalizeRemindEnabled('false')).toBe(false)
  })

  it('true 及其他真值都视为开（脏数据不会静默关掉提醒）', () => {
    expect(normalizeRemindEnabled(true)).toBe(true)
    expect(normalizeRemindEnabled(1)).toBe(true)
    expect(normalizeRemindEnabled('1')).toBe(true)
    expect(normalizeRemindEnabled({})).toBe(true)
  })
})

describe('haptic / listenPushClick —— 测试环境下安全降级', () => {
  it('无 plus / navigator.vibrate 时 haptic 静默返回 false', () => {
    expect(haptic()).toBe(false)
    expect(haptic(30)).toBe(false)
  })

  it('无 plus.push 时 listenPushClick 返回 false，不抛错', () => {
    expect(listenPushClick(function () {})).toBe(false)
    expect(listenPushClick(null)).toBe(false)
  })
})
