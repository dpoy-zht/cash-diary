import { describe, it, expect } from 'vitest'
import {
  recentCombos,
  recentNotes,
  QUICK_WINDOW_DAYS,
  QUICK_MIN_COUNT,
  COMBO_MAX,
  NOTE_MAX
} from '../src/utils/quick.js'

/** 固定"现在"：2026-10-11 12:00（本地时区），窗口边界好算 */
const NOW = new Date(2026, 9, 11, 12, 0, 0).getTime()
const DAY = 86400000

/** 造一条流水（默认：昨天、支出、早餐 7 元、无备注） */
function tx(o) {
  return Object.assign(
    {
      id: 1,
      account_id: 1,
      category_id: 1,
      type: 'expense',
      amount_cents: 700,
      note: '',
      occurred_at: NOW - DAY,
      deleted_at: null
    },
    o
  )
}

describe('recentCombos —— 常用组合推导', () => {
  it('按 类型+分类+备注+金额 归并；次数 ≥2 才入选；排序 次数↓ → 最近↓', () => {
    const rows = [
      // 早餐 7 元 ×3（最频繁）
      tx({ id: 1, note: '豆浆油条' }),
      tx({ id: 2, note: '豆浆油条', occurred_at: NOW - 2 * DAY }),
      tx({ id: 3, note: '豆浆油条', occurred_at: NOW - 5 * DAY }),
      // 奶茶 19 元 ×2（次数并列次之）
      tx({ id: 4, category_id: 2, amount_cents: 1900, note: '三分糖', occurred_at: NOW - 3 * DAY }),
      tx({ id: 5, category_id: 2, amount_cents: 1900, note: '三分糖' }),
      // 只出现一次 → 不叫习惯，不入选
      tx({ id: 6, amount_cents: 23500, note: '请客' })
    ]
    const out = recentCombos(rows, { now: NOW })
    expect(out.length).toBe(2)
    expect(out[0]).toMatchObject({ type: 'expense', categoryId: 1, note: '豆浆油条', amountCents: 700, count: 3 })
    expect(out[0].lastAt).toBe(NOW - DAY)
    expect(out[1]).toMatchObject({ categoryId: 2, note: '三分糖', count: 2 })
  })

  it('次数并列时最近发生的排前面', () => {
    const rows = [
      tx({ id: 1, category_id: 2, amount_cents: 1900, occurred_at: NOW - 9 * DAY }),
      tx({ id: 2, category_id: 2, amount_cents: 1900, occurred_at: NOW - 8 * DAY }),
      tx({ id: 3, category_id: 3, amount_cents: 3200, occurred_at: NOW - DAY }),
      tx({ id: 4, category_id: 3, amount_cents: 3200 })
    ]
    const out = recentCombos(rows, { now: NOW })
    expect(out[0].categoryId).toBe(3)
    expect(out[1].categoryId).toBe(2)
  })

  it(`窗口边界：正好 ${QUICK_WINDOW_DAYS} 天前算在内，再早一天不算`, () => {
    const rows = [
      tx({ id: 1, occurred_at: NOW - QUICK_WINDOW_DAYS * DAY }),
      tx({ id: 2, occurred_at: NOW - QUICK_WINDOW_DAYS * DAY }),
      tx({ id: 3, occurred_at: NOW - (QUICK_WINDOW_DAYS + 1) * DAY }),
      tx({ id: 4, occurred_at: NOW - (QUICK_WINDOW_DAYS + 1) * DAY })
    ]
    const out = recentCombos(rows, { now: NOW })
    expect(out.length).toBe(1)
    expect(out[0].id).toBeUndefined()
    expect(out[0].amountCents).toBe(700)
  })

  it('软删除 / 非法类型 / 0 金额 / 未来时间都不参与', () => {
    const rows = [
      tx({ id: 1, deleted_at: 123 }),
      tx({ id: 2, deleted_at: 123 }),
      tx({ id: 3, type: 'transfer' }),
      tx({ id: 4, type: 'transfer' }),
      tx({ id: 5, amount_cents: 0 }),
      tx({ id: 6, amount_cents: 0 }),
      tx({ id: 7, occurred_at: NOW + DAY }),
      tx({ id: 8, occurred_at: NOW + DAY })
    ]
    expect(recentCombos(rows, { now: NOW })).toEqual([])
  })

  it('备注 trim 后归并：带首尾空格的与干净的算同一个习惯', () => {
    const rows = [
      tx({ id: 1, note: '  豆浆油条 ' }),
      tx({ id: 2, note: '豆浆油条' })
    ]
    const out = recentCombos(rows, { now: NOW })
    expect(out.length).toBe(1)
    expect(out[0].note).toBe('豆浆油条')
    expect(out[0].count).toBe(2)
  })

  it('金额或备注不同就是不同组合，不归并', () => {
    const rows = [
      tx({ id: 1, note: '豆浆油条' }),
      tx({ id: 2, note: '豆浆油条', amount_cents: 900 }),
      tx({ id: 3, note: '油条豆浆' })
    ]
    expect(recentCombos(rows, { now: NOW })).toEqual([])
  })

  it('支出与收入不归并（同分类同金额也不行）', () => {
    const rows = [
      tx({ id: 1, category_id: 7, type: 'income', amount_cents: 1850000, note: '工资' }),
      tx({ id: 2, category_id: 7, type: 'expense', amount_cents: 1850000, note: '工资' })
    ]
    expect(recentCombos(rows, { now: NOW })).toEqual([])
  })

  it('topN 截断（默认 6）：8 个候选只留 6 个', () => {
    const rows = []
    for (let i = 1; i <= 8; i += 1) {
      rows.push(tx({ id: i * 2 - 1, category_id: i, amount_cents: 100 * i }))
      rows.push(tx({ id: i * 2, category_id: i, amount_cents: 100 * i }))
    }
    const out = recentCombos(rows, { now: NOW })
    expect(out.length).toBe(COMBO_MAX)
  })

  it('空/脏输入不炸，常量值钉死（改阈值必须过测试这一关）', () => {
    expect(recentCombos(null)).toEqual([])
    expect(recentCombos(undefined)).toEqual([])
    expect(recentCombos([])).toEqual([])
    expect(recentCombos('x')).toEqual([])
    expect(QUICK_WINDOW_DAYS).toBe(60)
    expect(QUICK_MIN_COUNT).toBe(2)
    expect(COMBO_MAX).toBe(6)
    expect(NOTE_MAX).toBe(5)
  })
})

describe('recentNotes —— 常用备注推导', () => {
  it('去重 + 排序 次数↓ → 最近↓；无备注门槛（写过一次也算）', () => {
    const rows = [
      tx({ id: 1, note: '买菜', occurred_at: NOW - 3 * DAY }),
      tx({ id: 2, note: '买菜' }),
      tx({ id: 3, note: '买菜', occurred_at: NOW - 9 * DAY }),
      tx({ id: 4, note: '给车充电', occurred_at: NOW - 2 * DAY }),
      tx({ id: 5, category_id: 7, type: 'income', amount_cents: 62000, note: '外包结算' })
    ]
    const out = recentNotes(rows, { now: NOW })
    // 买菜 3 次排最前；外包结算（昨天，默认时间戳）与给车充电（前天）次数并列，
    // 按最近发生排序 → 外包结算在前
    expect(out.map(function (n) { return n.note })).toEqual(['买菜', '外包结算', '给车充电'])
    expect(out[0].count).toBe(3)
  })

  it('空白备注（纯空格）不入选', () => {
    const rows = [tx({ id: 1, note: '   ' })]
    expect(recentNotes(rows, { now: NOW })).toEqual([])
  })

  it('topN 默认 5；窗口外的不算', () => {
    const rows = []
    for (let i = 1; i <= 7; i += 1) rows.push(tx({ id: i, note: '备注' + i }))
    rows.push(tx({ id: 99, note: '很老的备注', occurred_at: NOW - 61 * DAY }))
    const out = recentNotes(rows, { now: NOW })
    expect(out.length).toBe(NOTE_MAX)
    expect(out.some(function (n) { return n.note === '很老的备注' })).toBe(false)
  })

  it('空/脏输入不炸', () => {
    expect(recentNotes(null)).toEqual([])
    expect(recentNotes(undefined, { now: NOW })).toEqual([])
  })
})
