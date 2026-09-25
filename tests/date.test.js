import { describe, it, expect } from 'vitest'
import {
  pad2,
  ymOf,
  monthRange,
  dayStart,
  dayLabel,
  groupByDay,
  toDateStr,
  tsFromDateStr
} from '../src/utils/date.js'

describe('ymOf —— 月份键', () => {
  it('格式为 YYYY-MM 且补零', () => {
    expect(ymOf(new Date(2026, 8, 24, 22, 0).getTime())).toBe('2026-09')
    expect(ymOf(new Date(2026, 11, 1, 0, 0).getTime())).toBe('2026-12')
  })
})

describe('monthRange —— 半开区间 [月初, 下月月初)', () => {
  it('起止点正确且覆盖整月', () => {
    const [start, end] = monthRange(2026, 9)
    expect(new Date(start).getDate()).toBe(1)
    expect(new Date(start).getHours()).toBe(0)
    expect(end).toBe(new Date(2026, 9, 1).getTime())

    const mid = new Date(2026, 8, 15, 12, 0).getTime()
    expect(mid >= start && mid < end).toBe(true)
  })

  it('月末边界：本月最后一毫秒在内，下月第一毫秒在外', () => {
    const [start, end] = monthRange(2026, 9)
    expect(new Date(2026, 8, 30, 23, 59, 59).getTime() < end).toBe(true)
    expect(new Date(2026, 9, 1, 0, 0, 0).getTime() >= end).toBe(true)
    expect(new Date(2026, 7, 31, 23, 59, 59).getTime() < start).toBe(true)
  })

  it('跨年月份正确', () => {
    const [, end] = monthRange(2026, 12)
    expect(new Date(end).getFullYear()).toBe(2027)
    expect(new Date(end).getMonth()).toBe(0)
  })
})

describe('dayLabel —— 今天 / 昨天 / 具体日期', () => {
  it('今天与昨天带前缀，更早的只显示日期', () => {
    const now = Date.now()
    expect(dayLabel(now).startsWith('今天')).toBe(true)
    expect(dayLabel(now - 86400000).startsWith('昨天')).toBe(true)

    const older = new Date(2026, 8, 20, 10, 0).getTime()
    expect(dayLabel(older).startsWith('9月20日')).toBe(true)
    expect(dayLabel(older)).toContain('周')
  })
})

describe('groupByDay —— 按天分组', () => {
  it('天按倒序、组内按时间倒序', () => {
    const mk = function (d, h) { return new Date(2026, 8, d, h).getTime() }
    const records = [
      { id: 1, occurred_at: mk(1, 9) },
      { id: 2, occurred_at: mk(3, 10) },
      { id: 3, occurred_at: mk(3, 8) }
    ]
    const groups = groupByDay(records)
    expect(groups.length).toBe(2)
    expect(new Date(groups[0].day).getDate()).toBe(3)
    expect(groups[0].items.map(function (r) { return r.id })).toEqual([2, 3])
    expect(new Date(groups[1].day).getDate()).toBe(1)
  })

  it('空数组返回空分组', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('toDateStr / tsFromDateStr —— 日期选择器与时间戳互转', () => {
  it('toDateStr 补零', () => {
    expect(toDateStr(new Date(2026, 0, 5).getTime())).toBe('2026-01-05')
  })

  it('tsFromDateStr 落在指定日期内，取当前时刻的时分', () => {
    const ts = tsFromDateStr('2026-09-24')
    const d = new Date(ts)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(24)
  })

  it('空值回退到当前时间', () => {
    const ts = tsFromDateStr('')
    expect(Math.abs(ts - Date.now())).toBeLessThan(5000)
  })
})

describe('pad2 / dayStart', () => {
  it('pad2 补零', () => {
    expect(pad2(3)).toBe('03')
    expect(pad2(12)).toBe('12')
  })
  it('dayStart 归零到当天 00:00', () => {
    const ts = new Date(2026, 8, 24, 18, 45, 30).getTime()
    const s = dayStart(ts)
    const d = new Date(s)
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0])
    expect(d.getDate()).toBe(24)
    expect(s).toBeLessThanOrEqual(ts)
  })
})
