import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats, DEFAULT_CATEGORIES } from '../src/services/category.js'
import { resetAll } from '../src/services/maintenance.js'
import * as txService from '../src/services/tx.js'
import { buildAddInput, buildTx } from '../src/services/tx.js'
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

describe('页面 → 服务 的字段契约（回归）', () => {
  /**
   * 真实事故：add.vue 的 save() 曾经直接传数据库字段名
   * （amount_cents / category_id / occurred_at），而 buildTx 期望的是
   * 页面输入字段名（amountStr / categoryId / ts）。
   * 结果 buildTx 读到 undefined → 抛"金额无效"→ 异常发生在 @click 里没人接，
   * 表现就是**真机上点"记好啦"毫无反应**，而所有单测都是绿的。
   * 下面的用例专门钉住这条边界。
   */
  let ym
  let expenseCat

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    ym = ymOf(Date.now())
    expenseCat = (await listCats()).find(function (c) { return c.type === 'expense' })
  })

  it('buildAddInput 产出的 DTO 能被 buildTx 接受，金额/分类/日期都对得上', () => {
    const dto = buildAddInput({
      amountText: '19.9',
      categoryId: expenseCat.id,
      type: 'expense',
      note: '  午餐  ',
      ts: 1730000000000
    })
    const rec = buildTx(dto)
    expect(rec.amount_cents).toBe(1990)
    expect(rec.category_id).toBe(expenseCat.id)
    expect(rec.type).toBe('expense')
    expect(rec.note).toBe('午餐')
    expect(rec.occurred_at).toBe(1730000000000)
  })

  it('键盘缓冲的字符串（含前导 0、小数点）能正确转成分', () => {
    expect(buildTx(buildAddInput({ amountText: '0.01', categoryId: 1, type: 'expense' })).amount_cents).toBe(1)
    expect(buildTx(buildAddInput({ amountText: '8500', categoryId: 1, type: 'income' })).amount_cents).toBe(850000)
  })

  it('曾经踩过的坑：页面直接传数据库字段名会被拦下，并报出"内部错误"而不是"金额无效"', () => {
    const wrong = {
      amount_cents: 1990,
      category_id: expenseCat.id,
      type: 'expense',
      occurred_at: Date.now()
    }
    expect(function () { buildTx(wrong) }).toThrow('内部错误')
    // 让排查更快：错误信息要点出缺的是哪个字段
    expect(function () { buildTx(wrong) }).toThrow('amountStr')
  })

  it('用户真的没输金额时，仍然是"金额无效"（不误报内部错误）', () => {
    expect(function () { buildTx(buildAddInput({ amountText: '', categoryId: 1, type: 'expense' })) })
      .toThrow('金额无效')
  })

  it('记一笔全链路：按页面的方式构造输入 → 落库 → 能查到', async () => {
    await txService.addTx(buildAddInput({
      amountText: '19.9',
      categoryId: expenseCat.id,
      type: 'expense',
      note: '午餐',
      ts: Date.now()
    }))
    const list = await txService.listByMonth(ym)
    expect(list.length).toBe(1)
    expect(list[0].amount_cents).toBe(1990)
    expect(list[0].category_id).toBe(expenseCat.id)
    expect(list[0].note).toBe('午餐')
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
