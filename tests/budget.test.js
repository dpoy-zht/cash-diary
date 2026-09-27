import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats } from '../src/services/category.js'
import * as accountService from '../src/services/account.js'
import * as budgetService from '../src/services/budget.js'
import * as txService from '../src/services/tx.js'
import { resetAll } from '../src/services/maintenance.js'
import { budgetStatus, progressPercent, overText, overAlertKey, pickOverAlertKeys, WARN_RATIO } from '../src/utils/budget.js'
import { ymOf } from '../src/utils/date.js'

describe('budgetStatus —— 预算判断（纯函数）', () => {
  it('没设预算：hasLimit=false，level=none，不算超支也不提示', () => {
    const s = budgetStatus(0, 99999)
    expect(s.hasLimit).toBe(false)
    expect(s.level).toBe('none')
    expect(s.ratio).toBe(0)
  })

  it('花得少 → safe，剩余为正', () => {
    const s = budgetStatus(100000, 30000)
    expect(s.level).toBe('safe')
    expect(s.remainCents).toBe(70000)
    expect(s.ratio).toBeCloseTo(0.3)
  })

  it('花到 80% 临界 → warn（含等于）', () => {
    expect(budgetStatus(100000, 79999).level).toBe('safe')
    expect(budgetStatus(100000, 80000).level).toBe('warn')
    expect(WARN_RATIO).toBe(0.8)
  })

  it('花到限额 → over，剩余为 0', () => {
    const s = budgetStatus(100000, 100000)
    expect(s.level).toBe('over')
    expect(s.remainCents).toBe(0)
  })

  it('超出限额 → over，剩余为负数（页面靠这个算"已超 ¥X"）', () => {
    const s = budgetStatus(100000, 123456)
    expect(s.level).toBe('over')
    expect(s.remainCents).toBe(-23456)
  })

  it('非法入参不抛错', () => {
    expect(budgetStatus(null, null).level).toBe('none')
    expect(budgetStatus(-100, 50).level).toBe('none')
    expect(budgetStatus('abc', 'def').level).toBe('none')
  })
})

describe('progressPercent / overText', () => {
  it('进度百分比按比例算，超出封顶 100', () => {
    expect(progressPercent(100000, 25000)).toBe(25)
    expect(progressPercent(100000, 100000)).toBe(100)
    expect(progressPercent(100000, 500000)).toBe(100)
    expect(progressPercent(0, 5000)).toBe(0)
  })

  it('overText 只在超支时给文案，且是正数金额', () => {
    expect(overText(100000, 90000)).toBe('')
    expect(overText(100000, 123456)).toBe('超支了 ¥234.56')
  })
})

describe('预算存取（服务层）', () => {
  let ym
  let cats
  let exp1
  let exp2

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    await accountService.seedDefaultIfEmpty()
    ym = ymOf(Date.now())
    cats = await listCats()
    const expense = cats.filter(function (c) { return c.type === 'expense' })
    exp1 = expense[0]
    exp2 = expense[1]
  })

  it('新库没有任何预算', async () => {
    const all = await budgetService.getAll(1)
    expect(all.totalCents).toBe(0)
    expect(all.byCategory).toEqual({})
  })

  it('设置总预算与分类预算后可读回', async () => {
    await budgetService.setTotal(1, '5000')
    await budgetService.setCategory(1, exp1.id, '1200')
    const all = await budgetService.getAll(1)
    expect(all.totalCents).toBe(500000)
    expect(all.byCategory[String(exp1.id)]).toBe(120000)
  })

  it('重复设置是覆盖而不是新增（SQLite 里 NULL 不受 UNIQUE 约束，所以靠服务层做 upsert）', async () => {
    await budgetService.setTotal(1, '5000')
    await budgetService.setTotal(1, '6000')
    const all = await budgetService.getAll(1)
    expect(all.totalCents).toBe(600000)
    const rows = await getStorage().budgetList(1)
    expect(rows.filter(function (r) { return r.category_id == null }).length).toBe(1)
  })

  it('传空 / 0 → 清除该条预算（不设预算是合法状态）', async () => {
    await budgetService.setTotal(1, '5000')
    await budgetService.setCategory(1, exp1.id, '1200')
    await budgetService.setTotal(1, '')
    await budgetService.setCategory(1, exp1.id, '0')
    const all = await budgetService.getAll(1)
    expect(all.totalCents).toBe(0)
    expect(all.byCategory[String(exp1.id)]).toBeUndefined()
  })

  it('金额非法时报「金额无效」，且不会写坏数据', async () => {
    await expect(budgetService.setTotal(1, 'abc')).rejects.toThrow('金额无效')
    await expect(budgetService.setTotal(1, '1.999')).rejects.toThrow('金额无效')
    await expect(budgetService.setCategory(1, null, '100')).rejects.toThrow('请选择分类')
    expect((await budgetService.getAll(1)).totalCents).toBe(0)
  })

  it('预算是按账本隔离的', async () => {
    await accountService.create('旅行基金')
    const travel = (await accountService.listWithStats()).find(function (a) { return a.name === '旅行基金' })
    await budgetService.setTotal(1, '5000')
    await budgetService.setTotal(travel.id, '2000')
    expect((await budgetService.getAll(1)).totalCents).toBe(500000)
    expect((await budgetService.getAll(travel.id)).totalCents).toBe(200000)
  })

  it('分类预算互不影响', async () => {
    await budgetService.setCategory(1, exp1.id, '100')
    await budgetService.setCategory(1, exp2.id, '200')
    const all = await budgetService.getAll(1)
    expect(all.byCategory[String(exp1.id)]).toBe(10000)
    expect(all.byCategory[String(exp2.id)]).toBe(20000)
  })
})

describe('预算 × 流水：超支判断联动', () => {
  let ym
  let exp1

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    await accountService.seedDefaultIfEmpty()
    ym = ymOf(Date.now())
    exp1 = (await listCats()).filter(function (c) { return c.type === 'expense' })[0]
  })

  it('本月已花超过预算 → 判定为 over，金额与剩余能对上', async () => {
    await budgetService.setTotal(1, '1000') // 预算 ¥1000
    await txService.addTx({ amountStr: '600', categoryId: exp1.id, type: 'expense', ts: Date.now() })
    let s = budgetStatus((await budgetService.getAll(1)).totalCents, (await txService.monthSummary(ym, 1)).expenseCents)
    expect(s.level).toBe('safe')
    expect(s.remainCents).toBe(40000)

    await txService.addTx({ amountStr: '500', categoryId: exp1.id, type: 'expense', ts: Date.now() })
    s = budgetStatus((await budgetService.getAll(1)).totalCents, (await txService.monthSummary(ym, 1)).expenseCents)
    expect(s.level).toBe('over')
    expect(s.spentCents).toBe(110000)
    expect(s.remainCents).toBe(-10000)
    expect(overText(s.limitCents, s.spentCents)).toBe('超支了 ¥100.00')
  })

  it('软删除后已花回落，超支状态跟着解除', async () => {
    await budgetService.setTotal(1, '1000')
    await txService.addTx({ amountStr: '1200', categoryId: exp1.id, type: 'expense', ts: Date.now() })
    let spent = (await txService.monthSummary(ym, 1)).expenseCents
    expect(budgetStatus(100000, spent).level).toBe('over')

    const list = await txService.listByMonth(ym, 1)
    await txService.removeTx(list[0].id)
    spent = (await txService.monthSummary(ym, 1)).expenseCents
    expect(budgetStatus(100000, spent).level).toBe('safe')
  })

  it('重置数据会把预算一并清掉（重新开始不留旧预算）', async () => {
    await budgetService.setTotal(1, '5000')
    await budgetService.setCategory(1, exp1.id, '800')
    await resetAll()
    const all = await budgetService.getAll(1)
    expect(all.totalCents).toBe(0)
    expect(all.byCategory).toEqual({})
  })
})

describe('overAlertKey —— 超支提醒去重键', () => {
  it('格式：cashDiary.overAlerted.<ym>.<accountId>', () => {
    expect(overAlertKey('2026-09', 1)).toBe('cashDiary.overAlerted.2026-09.1')
    expect(overAlertKey('2026-12', 2)).toBe('cashDiary.overAlerted.2026-12.2')
  })

  it('非法月份兜底 unknown，不抛错', () => {
    expect(overAlertKey('', 1)).toBe('cashDiary.overAlerted.unknown.1')
    expect(overAlertKey('2026-9', 1)).toBe('cashDiary.overAlerted.unknown.1')
    expect(overAlertKey(null, 1)).toBe('cashDiary.overAlerted.unknown.1')
  })

  it('非法账本兜底默认账本 1', () => {
    expect(overAlertKey('2026-09')).toBe('cashDiary.overAlerted.2026-09.1')
    expect(overAlertKey('2026-09', 0)).toBe('cashDiary.overAlerted.2026-09.1')
    expect(overAlertKey('2026-09', -3)).toBe('cashDiary.overAlerted.2026-09.1')
  })
})

describe('pickOverAlertKeys —— 重置数据时挑选要清的去重键', () => {
  it('只挑出带前缀的键，其余不动', () => {
    const keys = [
      'cashDiary.overAlerted.2026-09.1',
      'cashDiary.overAlerted.2026-08.2',
      'cashDiary.memory.v1',
      'user-theme',
      'cashDiary.overAlertedX.1'
    ]
    expect(pickOverAlertKeys(keys)).toEqual([
      'cashDiary.overAlerted.2026-09.1',
      'cashDiary.overAlerted.2026-08.2'
    ])
  })

  it('非法入参不抛错', () => {
    expect(pickOverAlertKeys(null)).toEqual([])
    expect(pickOverAlertKeys('not-array')).toEqual([])
    expect(pickOverAlertKeys([1, null, {}])).toEqual([])
  })
})
