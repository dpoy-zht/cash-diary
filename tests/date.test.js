import { describe, it, expect } from 'vitest'
import {
  pad2,
  ymOf,
  monthRange,
  dayStart,
  dayLabel,
  groupByDay,
  toDateStr,
  tsFromDateStr,
  replaceDateKeepTime,
  weekStart,
  dayRange,
  weekRange,
  yearRange,
  lastNDayStarts,
  lastNWeekStarts,
  ymsOfYear,
  dayTrendLabel,
  periodNameOf,
  ymLabelFull,
  daysInMonth,
  prevYmOf
} from '../src/utils/date.js'

/** 本地时间造时间戳（与工具函数的本地时区口径一致） */
function at(y, m, d, h) {
  return new Date(y, m - 1, d, h == null ? 12 : h, 0, 0).getTime()
}

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

/* ================= 周期区间（统计页 日 / 周 / 年） =================
 * 已知锚点：2026-09-27 是周日，其所在周（周一为始）是 9/21 ~ 9/27。
 */

describe('weekStart —— 周一 0 点', () => {
  it('周日归到本周的周一（9/27 周日 → 9/21 周一）', () => {
    const s = new Date(weekStart(at(2026, 9, 27)))
    expect([s.getFullYear(), s.getMonth() + 1, s.getDate(), s.getDay()]).toEqual([2026, 9, 21, 1])
  })
  it('周一就是自己；周中归到本周一；周六也是本周一', () => {
    expect(weekStart(at(2026, 9, 21))).toBe(at(2026, 9, 21, 0))
    expect(new Date(weekStart(at(2026, 9, 23))).getDate()).toBe(21)
    expect(new Date(weekStart(at(2026, 9, 26))).getDate()).toBe(21)
  })
})

describe('dayRange / weekRange / yearRange —— 半开区间', () => {
  it('dayRange = [当天 0 点, 次日 0 点)', () => {
    const [start, end] = dayRange(at(2026, 9, 27, 15))
    expect(start).toBe(at(2026, 9, 27, 0))
    expect(end).toBe(at(2026, 9, 28, 0))
    expect(at(2026, 9, 27, 23, 59) < end).toBe(true)
  })

  it('weekRange = [周一 0 点, 下周一 0 点)', () => {
    const [start, end] = weekRange(at(2026, 9, 27))
    expect(start).toBe(at(2026, 9, 21, 0))
    expect(end).toBe(at(2026, 9, 28, 0))
  })

  it('yearRange = [1月1日, 次年 1月1日)，跨年正确', () => {
    const [start, end] = yearRange(2026)
    expect(new Date(start).getMonth()).toBe(0)
    expect(new Date(start).getDate()).toBe(1)
    expect(new Date(end).getFullYear()).toBe(2027)
    expect(at(2026, 12, 31, 23) < end).toBe(true)
  })
})

describe('lastNDayStarts / lastNWeekStarts —— 分桶键序列', () => {
  it('最近 n 天的 0 点，从旧到新，含当天', () => {
    expect(lastNDayStarts(3, at(2026, 9, 27, 15))).toEqual([
      at(2026, 9, 25, 0), at(2026, 9, 26, 0), at(2026, 9, 27, 0)
    ])
  })

  it('最近 n 周的周一 0 点，从旧到新，含本周', () => {
    expect(lastNWeekStarts(3, at(2026, 9, 27))).toEqual([
      at(2026, 9, 7, 0), at(2026, 9, 14, 0), at(2026, 9, 21, 0)
    ])
  })

  it('非法 n 兜底为 1', () => {
    expect(lastNDayStarts(0, at(2026, 9, 27))).toEqual([at(2026, 9, 27, 0)])
    expect(lastNWeekStarts(null, at(2026, 9, 27))).toEqual([at(2026, 9, 21, 0)])
  })
})

describe('ymsOfYear / dayTrendLabel / periodNameOf', () => {
  it('ymsOfYear 返回 12 个月键，补零', () => {
    const yms = ymsOfYear(2026)
    expect(yms.length).toBe(12)
    expect(yms[0]).toBe('2026-01')
    expect(yms[11]).toBe('2026-12')
  })

  it('dayTrendLabel 去掉前导零', () => {
    expect(dayTrendLabel(at(2026, 9, 27))).toBe('9/27')
    expect(dayTrendLabel(at(2026, 10, 5))).toBe('10/5')
  })

  it('periodNameOf 各期间前缀；未知 key 兜底本月', () => {
    expect(periodNameOf('day')).toBe('本日')
    expect(periodNameOf('week')).toBe('本周')
    expect(periodNameOf('month')).toBe('本月')
    expect(periodNameOf('year')).toBe('本年')
    expect(periodNameOf('xxx')).toBe('本月')
  })
})

describe('replaceDateKeepTime —— 只改日期不动时刻（T3.2 改期编辑）', () => {
  it('年月日替换为目标日期，时/分/秒沿用原值', () => {
    const src = new Date(2026, 8, 15, 15, 30, 20).getTime()
    const out = new Date(replaceDateKeepTime(src, '2026-08-03'))
    expect(out.getFullYear()).toBe(2026)
    expect(out.getMonth() + 1).toBe(8)
    expect(out.getDate()).toBe(3)
    expect(out.getHours()).toBe(15)
    expect(out.getMinutes()).toBe(30)
    expect(out.getSeconds()).toBe(20)
  })

  it('跨年改期正确', () => {
    const src = new Date(2026, 0, 5, 9, 0, 0).getTime()
    expect(toDateStr(replaceDateKeepTime(src, '2025-12-31'))).toBe('2025-12-31')
  })

  it('同一天的日期字符串不改动时间戳', () => {
    const src = new Date(2026, 8, 15, 15, 30, 0).getTime()
    expect(replaceDateKeepTime(src, toDateStr(src))).toBe(src)
  })

  it('日期非法时原样返回原时间戳，不产生 NaN', () => {
    const src = new Date(2026, 8, 15, 15, 30, 0).getTime()
    expect(replaceDateKeepTime(src, '')).toBe(src)
    expect(replaceDateKeepTime(src, null)).toBe(src)
    expect(replaceDateKeepTime(src, '2026-13')).toBe(src)
  })

  it('原时间戳非法时兜底为"现在"，返回值仍是有限数字', () => {
    const out = replaceDateKeepTime(NaN, '2026-08-03')
    expect(Number.isFinite(out)).toBe(true)
    expect(toDateStr(out)).toBe('2026-08-03')
  })
})

describe('月份工具（T4.4 月度报告用）', () => {
  it('ymLabelFull：YYYY-MM → 2026年9月；非法输入返回空串', () => {
    expect(ymLabelFull('2026-09')).toBe('2026年9月')
    expect(ymLabelFull('2026-12')).toBe('2026年12月')
    expect(ymLabelFull('')).toBe('')
    expect(ymLabelFull(null)).toBe('')
    expect(ymLabelFull('2026')).toBe('')
  })

  it('daysInMonth：大小月与闰年都按日历算', () => {
    expect(daysInMonth('2026-09')).toBe(30)
    expect(daysInMonth('2026-01')).toBe(31)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29) // 闰年
    expect(daysInMonth('2026-04')).toBe(30)
  })

  it('daysInMonth：非法月份返回 0（而不是 NaN，调用方据此跳过依赖天数的计算）', () => {
    expect(daysInMonth('')).toBe(0)
    expect(daysInMonth(null)).toBe(0)
    expect(daysInMonth('2026-13')).toBe(0)
    expect(daysInMonth('2026-00')).toBe(0)
  })

  it('prevYmOf：上一个月，跨年与跨世纪（2000 闰年）都对', () => {
    expect(prevYmOf('2026-09')).toBe('2026-08')
    expect(prevYmOf('2026-01')).toBe('2025-12')
    expect(prevYmOf('2026-03')).toBe('2026-02')
    expect(prevYmOf('2000-03')).toBe('2000-02')
  })

  it('prevYmOf：非法输入返回空串', () => {
    expect(prevYmOf('')).toBe('')
    expect(prevYmOf(null)).toBe('')
    expect(prevYmOf('2026-13')).toBe('')
  })
})
