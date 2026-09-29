import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats, DEFAULT_CATEGORIES } from '../src/services/category.js'
import { resetAll } from '../src/services/maintenance.js'
import * as txService from '../src/services/tx.js'
import { buildAddInput, buildTx, buildEditInput } from '../src/services/tx.js'
import { ymOf, monthRange, toDateStr } from '../src/utils/date.js'

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

  it('编辑改期：落到目标月份与日期，时刻沿用原记录（T3.2）', async () => {
    const cat = (await listCats()).find(function (c) { return c.type === 'expense' })
    const parts = ym.split('-').map(Number)
    // 原记录：本月 15 日 15:30
    const originalTs = new Date(parts[0], parts[1] - 1, 15, 15, 30, 0).getTime()
    await txService.addTx({ amountStr: '50', categoryId: cat.id, type: 'expense', note: '打车', ts: originalTs })
    const before = (await txService.listByMonth(ym))[0]
    expect(before.occurred_at).toBe(originalTs)

    // 改到上个月 3 日 —— 页面走的就是 buildEditInput 这条映射
    const lastTs = new Date(parts[0], parts[1] - 2, 3, 15, 30, 0).getTime()
    const targetDate = toDateStr(lastTs)
    const dto = buildEditInput(
      { amountStr: '60', categoryId: cat.id, note: '打车', type: 'expense', dateStr: targetDate },
      originalTs
    )
    await txService.updateTx(before.id, dto)

    // 本月列表清空、上月出现这条记录，金额同步更新
    expect((await txService.listByMonth(ym)).length).toBe(0)
    const moved = await txService.listByMonth(ymOf(lastTs))
    expect(moved.length).toBe(1)
    expect(moved[0].amount_cents).toBe(6000)

    // 时/分仍是 15:30：改日期不该把时刻顶成"现在"
    expect(toDateStr(moved[0].occurred_at)).toBe(targetDate)
    const d = new Date(moved[0].occurred_at)
    expect(d.getHours()).toBe(15)
    expect(d.getMinutes()).toBe(30)
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

describe('流水搜索（首页搜索框）', () => {
  let cats

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    cats = await listCats()
  })

  async function addCat(note, catId, ts, accountId) {
    const rec = buildTx({ amountStr: '10', categoryId: catId, type: 'expense', note: note, ts: ts })
    rec.account_id = accountId || 1
    const { getStorage: gs } = await import('../src/db/index.js')
    return gs().txInsert(rec)
  }

  it('备注包含关键词即命中（跨月、倒序、不区分大小写）', async () => {
    const cat = cats[0]
    const now = Date.now()
    await addCat('奶茶续命', cat.id, now)
    await addCat('上周的奶茶', cat.id, now - 40 * 86400000)
    await addCat('无关记录', cat.id, now)

    const rows = await txService.search('奶茶')
    expect(rows.length).toBe(2)
    // 倒序：最近的发生时间在前
    expect(rows[0].note).toBe('奶茶续命')
    expect(rows[1].note).toBe('上周的奶茶')

    const latin = await txService.search('COFFEE')
    expect(latin.length).toBe(0)
    await addCat('Morning Coffee', cat.id, now)
    expect((await txService.search('coffee')).length).toBe(1)
  })

  it('分类名也能命中（红包分类下的账，搜"红包"能搜到）', async () => {
    const gift = cats.find(function (c) { return c.name === '红包' && c.type === 'expense' })
    const other = cats.find(function (c) { return c.name === '其他' && c.type === 'expense' })
    const now = Date.now()
    await addCat('', gift.id, now)       // 备注为空，仅靠分类名命中
    await addCat('无关', other.id, now)

    const rows = await txService.search('红包')
    expect(rows.length).toBe(1)
    expect(rows[0].category_id).toBe(gift.id)
  })

  it('备注与分类名同时命中只出现一次', async () => {
    const milktea = cats.find(function (c) { return c.name === '奶茶' })
    await addCat('奶茶自由', milktea.id, Date.now())
    const rows = await txService.search('奶茶')
    expect(rows.length).toBe(1)
  })

  it('软删除的不出现；账本隔离；空白关键词返回空', async () => {
    const cat = cats[0]
    const now = Date.now()
    const id = await addCat('奶茶一条', cat.id, now)
    await addCat('奶茶二号', cat.id, now, 2) // 另一个账本

    // 软删除
    const { getStorage: gs } = await import('../src/db/index.js')
    await gs().txSoftDelete(id)

    // 默认账本：被删的一条不可见，另一账本的一条也隔离在外
    expect(await txService.search('奶茶')).toEqual([])

    // 指定账本 2 才能看到自己账本的记录
    const rows = await txService.search('奶茶', 2)
    expect(rows.length).toBe(1)
    expect(rows[0].account_id).toBe(2)

    expect(await txService.search('   ')).toEqual([])
    expect(await txService.search('')).toEqual([])
  })

  it('LIMIT 生效（防止短关键词撑爆列表）', async () => {
    const cat = cats[0]
    const now = Date.now()
    for (let i = 0; i < 5; i++) {
      await addCat('奶茶 ' + i, cat.id, now - i * 1000)
    }
    const { getStorage: gs } = await import('../src/db/index.js')
    const rows = await gs().txSearch('奶茶', [], 1, 3)
    expect(rows.length).toBe(3)
  })
})
