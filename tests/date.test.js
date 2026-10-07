import { describe, it, expect } from 'vitest'
import {
  pad2,
  ymOf,
  monthRange,
  dayStart,
  dayLabel,
  groupByDay,
  toDateStr,
  dateTimeLabel,
  shortDateTime,
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
  homeDateLabel,
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

describe('dateTimeLabel —— 手工拼「日期 + 时分」，不依赖 toLocaleString', () => {
  it('本地时区补零正确', () => {
    expect(dateTimeLabel(new Date(2026, 8, 30, 1, 20).getTime())).toBe('2026-09-30 01:20')
    expect(dateTimeLabel(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05 23:59')
    expect(dateTimeLabel(new Date(2026, 11, 31, 0, 0).getTime())).toBe('2026-12-31 00:00')
  })

  it('0 / 非法 / 负数返回空串（调用方自己给兜底文案）', () => {
    expect(dateTimeLabel(0)).toBe('')
    expect(dateTimeLabel(null)).toBe('')
    expect(dateTimeLabel(undefined)).toBe('')
    expect(dateTimeLabel('abc')).toBe('')
    expect(dateTimeLabel(-1)).toBe('')
  })
})

describe('homeDateLabel —— 首页顶部日期（当月到日、其他月到月）', () => {
  it('看的是当月：显示到日，日期取"今天"', () => {
    expect(homeDateLabel('2026-10', at(2026, 10, 4, 9))).toBe('2026年10月4日')
    expect(homeDateLabel('2026-10', at(2026, 10, 4, 23))).toBe('2026年10月4日')
  })

  it('看的是别的月：只显示年月（不编造那天的日期）', () => {
    expect(homeDateLabel('2026-09', at(2026, 10, 4))).toBe('2026年9月')
    expect(homeDateLabel('2025-12', at(2026, 10, 4))).toBe('2025年12月')
    expect(homeDateLabel('2026-11', at(2026, 10, 4))).toBe('2026年11月')
  })

  it('非当月时与 ymLabelFull 完全一致（不另起一套格式）', () => {
    ;['2026-01', '2026-09', '2027-03'].forEach(function (ym) {
      expect(homeDateLabel(ym, at(2026, 10, 4))).toBe(ymLabelFull(ym))
    })
  })

  it('跨月那一刻：上个月立刻退回"年月"，新月立刻显示到日', () => {
    const cross = at(2026, 11, 1, 0) // 11 月 1 日 00:00
    expect(homeDateLabel('2026-10', cross)).toBe('2026年10月')
    expect(homeDateLabel('2026-11', cross)).toBe('2026年11月1日')
  })

  it('月初/月末都不补零：1 号显示"1日"，31 号显示"31日"', () => {
    expect(homeDateLabel('2026-10', at(2026, 10, 1))).toBe('2026年10月1日')
    expect(homeDateLabel('2026-10', at(2026, 10, 31))).toBe('2026年10月31日')
  })

  it('闰年 2 月 29 日也正常（日期交给 Date 自己算）', () => {
    expect(homeDateLabel('2028-02', at(2028, 2, 29))).toBe('2028年2月29日')
  })

  it('不传 nowTs 时用真实的"现在"，且与今天一致（证明不是硬编码）', () => {
    const now = new Date()
    const expectText =
      now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日'
    expect(homeDateLabel(toDateStr(now.getTime()).slice(0, 7))).toBe(expectText)
  })

  it('日期确实跟着系统时间走：改注入的 nowTs，输出跟着变（无写死）', () => {
    const ym = '2026-10'
    const seen = [
      homeDateLabel(ym, at(2026, 10, 1)),
      homeDateLabel(ym, at(2026, 10, 15)),
      homeDateLabel(ym, at(2026, 10, 28))
    ]
    expect(seen).toEqual(['2026年10月1日', '2026年10月15日', '2026年10月28日'])
    expect(new Set(seen).size).toBe(3) // 三个不同时间戳给出三个不同日期
  })

  it('空/非法月份返回空串（不显示 NaN 或 undefined）', () => {
    expect(homeDateLabel('', at(2026, 10, 4))).toBe('')
    expect(homeDateLabel(null, at(2026, 10, 4))).toBe('')
    expect(homeDateLabel('乱写', at(2026, 10, 4))).toBe('')
  })
})

/* 统计页明细列表用（2026-10-07）：年份由期间标题给出，行里只留月/日 + 时分 */
describe('shortDateTime —— 紧凑日期时间', () => {
  it('格式为 M/D HH:mm，月日与时分都补足两位时/分', () => {
    expect(shortDateTime(new Date(2026, 8, 28, 12, 30).getTime())).toBe('9/28 12:30')
    expect(shortDateTime(new Date(2026, 0, 5, 9, 5).getTime())).toBe('1/5 09:05')
  })

  it('月与日不补前导零（列表里更紧凑）', () => {
    expect(shortDateTime(new Date(2026, 11, 1, 0, 0).getTime())).toBe('12/1 00:00')
  })

  it('非法 / 0 / 负数返回空串（调用方据此不渲染）', () => {
    expect(shortDateTime(0)).toBe('')
    expect(shortDateTime(-1)).toBe('')
    expect(shortDateTime(null)).toBe('')
    expect(shortDateTime(undefined)).toBe('')
    expect(shortDateTime('abc')).toBe('')
  })
})
