import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats, DEFAULT_CATEGORIES } from '../src/services/category.js'
import { resetAll } from '../src/services/maintenance.js'
import * as txService from '../src/services/tx.js'
import { ymOf, monthRange } from '../src/utils/date.js'

/**
 * 记账闭环集成测试（内存存储路径）。
 * 真机 SQLite 路径由 HBuilderX 运行到手机做冒烟，二者共用同一套 repository/services。
 */
describe('记账闭环（内存存储）', () => {
  let ym

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    ym = ymOf(Date.now())
  })

  it('内置分类初始化：12 支出 + 8 收入（对齐 v2.0 参考包）', async () => {
    const cats = await listCats()
    expect(cats.length).toBe(20)
    expect(cats.filter(function (c) { return c.type === 'expense' }).length).toBe(12)
    expect(cats.filter(function (c) { return c.type === 'income' }).length).toBe(8)
    expect(DEFAULT_CATEGORIES.length).toBe(20)
  })

  it('分类种子幂等：重复初始化不产生重复数据', async () => {
    await seedIfEmpty()
    await seedIfEmpty()
    expect((await listCats()).length).toBe(20)
  })

  it('记账 → 列表 → 月合计 → 编辑 → 软删除 全链路', async () => {
    const expenseCat = (await listCats()).find(function (c) { return c.type === 'expense' })
    const incomeCat = (await listCats()).find(function (c) { return c.type === 'income' })

    await txService.addTx({ amountStr: '19.9', categoryId: expenseCat.id, type: 'expense', note: '午餐', ts: Date.now() })
    await txService.addTx({ amountStr: '8500', categoryId: incomeCat.id, type: 'income', note: '工资', ts: Date.now() })

    let list = await txService.listByMonth(ym)
    expect(list.length).toBe(2)
    expect(list[0].amount_cents).toBeTypeOf('number')

    let summary = await txService.monthSummary(ym)
    expect(summary.expenseCents).toBe(1990)
    expect(summary.incomeCents).toBe(850000)

    // 编辑：金额与备注
    const target = list.find(function (r) { return r.type === 'expense' })
    await txService.updateTx(target.id, { amountStr: '29.9', note: '午餐+咖啡' })
    list = await txService.listByMonth(ym)
    summary = await txService.monthSummary(ym)
    expect(summary.expenseCents).toBe(2990)
    expect(list.find(function (r) { return r.id === target.id }).note).toBe('午餐+咖啡')

    // 软删除：列表与合计同步剔除
    await txService.removeTx(target.id)
    list = await txService.listByMonth(ym)
    summary = await txService.monthSummary(ym)
    expect(list.length).toBe(1)
    expect(summary.expenseCents).toBe(0)
    expect(summary.incomeCents).toBe(850000)
  })

  it('月合计与明细加总一致（整数分，分毫不差）', async () => {
    const cat = (await listCats()).find(function (c) { return c.type === 'expense' })
    const amounts = ['0.01', '0.1', '0.2', '19.99', '1234.56']
    for (const a of amounts) {
      await txService.addTx({ amountStr: a, categoryId: cat.id, type: 'expense', ts: Date.now() })
    }
    const list = await txService.listByMonth(ym)
    const manual = list.reduce(function (sum, r) { return sum + r.amount_cents }, 0)
    const summary = await txService.monthSummary(ym)
    expect(summary.expenseCents).toBe(manual)
    expect(summary.expenseCents).toBe(1 + 10 + 20 + 1999 + 123456)
  })

  it('非法输入被拒绝（金额无效 / 未选分类）', async () => {
    const cat = (await listCats()).find(function (c) { return c.type === 'expense' })
    await expect(txService.addTx({ amountStr: '0', categoryId: cat.id, type: 'expense' })).rejects.toThrow('金额无效')
    await expect(txService.addTx({ amountStr: '1.999', categoryId: cat.id, type: 'expense' })).rejects.toThrow('金额无效')
    await expect(txService.addTx({ amountStr: 'abc', categoryId: cat.id, type: 'expense' })).rejects.toThrow('金额无效')
    await expect(txService.addTx({ amountStr: '10', categoryId: null, type: 'expense' })).rejects.toThrow('请选择分类')
  })

  it('按月隔离：上个月的记录不出现在本月，也不计入本月合计', async () => {
    const cat = (await listCats()).find(function (c) { return c.type === 'expense' })
    const parts = ym.split('-').map(Number)
    // monthRange 内部用 new Date(y, m-1, 1)，月份传 0 会自动落到上一年 12 月
    const lastMonthTs = monthRange(parts[0], parts[1] - 1)[0] + 86400000

    await txService.addTx({ amountStr: '100', categoryId: cat.id, type: 'expense', ts: lastMonthTs })

    const thisList = await txService.listByMonth(ym)
    const thisSummary = await txService.monthSummary(ym)
    expect(thisList.length).toBe(0)
    expect(thisSummary.expenseCents).toBe(0)

    // 而它确实落在上个月
    const lastYm = ymOf(lastMonthTs)
    const lastList = await txService.listByMonth(lastYm)
    expect(lastList.length).toBe(1)
    expect(lastList[0].amount_cents).toBe(10000)
  })
})

describe('全量概览（账本页数据）', () => {
  let ym

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    ym = ymOf(Date.now())
  })

  it('空库时笔数与金额为 0、时间为 null', async () => {
    const o = await txService.overview()
    expect(o.totalCount).toBe(0)
    expect(o.incomeCents).toBe(0)
    expect(o.expenseCents).toBe(0)
    expect(o.firstAt).toBeNull()
    expect(o.lastAt).toBeNull()
  })

  it('累计所有月份的收支，并给出最早/最近一笔的时间', async () => {
    const cats = await listCats()
    const exp = cats.find(function (c) { return c.type === 'expense' })
    const inc = cats.find(function (c) { return c.type === 'income' })
    const parts = ym.split('-').map(Number)
    const lastMonthTs = monthRange(parts[0], parts[1] - 1)[0] + 86400000
    const nowTs = Date.now()

    await txService.addTx({ amountStr: '100', categoryId: exp.id, type: 'expense', ts: lastMonthTs })
    await txService.addTx({ amountStr: '19.9', categoryId: exp.id, type: 'expense', ts: nowTs })
    await txService.addTx({ amountStr: '8500', categoryId: inc.id, type: 'income', ts: nowTs })

    const o = await txService.overview()
    expect(o.totalCount).toBe(3) // 跨月份也算进累计
    expect(o.expenseCents).toBe(10000 + 1990)
    expect(o.incomeCents).toBe(850000)
    expect(o.firstAt).toBe(lastMonthTs)
    expect(o.lastAt).toBe(nowTs)
  })

  it('软删除的记录不计入概览', async () => {
    const cat = (await listCats()).find(function (c) { return c.type === 'expense' })
    await txService.addTx({ amountStr: '50', categoryId: cat.id, type: 'expense', ts: Date.now() })
    const list = await txService.listByMonth(ym)
    await txService.removeTx(list[0].id)

    const o = await txService.overview()
    expect(o.totalCount).toBe(0)
    expect(o.expenseCents).toBe(0)
  })
})

describe('重置数据（我的页入口）', () => {
  let ym

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    ym = ymOf(Date.now())
  })

  it('清空流水并恢复内置分类，重置后立刻可用', async () => {
    const cat = (await listCats()).find(function (c) { return c.type === 'expense' })
    await txService.addTx({ amountStr: '19.9', categoryId: cat.id, type: 'expense', ts: Date.now() })
    expect((await txService.listByMonth(ym)).length).toBe(1)

    await resetAll()

    // 流水清空
    expect((await txService.listByMonth(ym)).length).toBe(0)
    expect((await txService.overview()).totalCount).toBe(0)
    // 分类被重新种回来，数量与内容不变
    const cats = await listCats()
    expect(cats.length).toBe(20)
    expect(cats.filter(function (c) { return c.type === 'expense' }).length).toBe(12)
    expect(cats.filter(function (c) { return c.type === 'income' }).length).toBe(8)
  })

  it('重置后还能正常记账（分类 id 可用）', async () => {
    await resetAll()
    const cat = (await listCats())[0]
    expect(cat.id).toBeTruthy()
    await txService.addTx({ amountStr: '1', categoryId: cat.id, type: 'expense', ts: Date.now() })
    expect((await txService.listByMonth(ym)).length).toBe(1)
  })

  it('重复重置不报错', async () => {
    await resetAll()
    await resetAll()
    expect((await listCats()).length).toBe(20)
  })
})
