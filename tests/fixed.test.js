import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats } from '../src/services/category.js'
import { seedDefaultIfEmpty } from '../src/services/account.js'
import * as fixedService from '../src/services/fixed.js'
import * as txService from '../src/services/tx.js'
import { ymOf } from '../src/utils/date.js'

/** 固定支出（每月自动补记）业务测试，走内存存储全链路 */
describe('固定支出 —— 到期判断 / 校验 / 自动补记', () => {
  let cats
  const T = new Date(2026, 8, 28, 9, 0, 0).getTime() // 2026-09-28 09:00（月份 0 起制）

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    await seedDefaultIfEmpty()
    cats = await listCats()
  })

  it('isDue / dueFixedExpenses：启用且当月未记才算到期', () => {
    const ym = '2026-10'
    expect(fixedService.isDue({ enabled: true, last_posted_ym: '2026-09' }, ym)).toBe(true)
    expect(fixedService.isDue({ enabled: true, last_posted_ym: '2026-10' }, ym)).toBe(false)
    expect(fixedService.isDue({ enabled: false, last_posted_ym: '' }, ym)).toBe(false)
    expect(fixedService.isDue(null, ym)).toBe(false)
    const due = fixedService.dueFixedExpenses([
      { id: 1, enabled: true, last_posted_ym: '2026-09' },
      { id: 2, enabled: true, last_posted_ym: '2026-10' },
      { id: 3, enabled: false, last_posted_ym: '' }
    ], ym)
    expect(due.map(function (f) { return f.id })).toEqual([1])
  })

  it('addFixed：校验金额 / 分类 / 记账日，创建后当月不自动补记', async () => {
    const lunch = cats.find(function (c) { return c.name === '午餐' })
    await expect(fixedService.addFixed({ amountStr: 'abc', categoryId: lunch.id, dayOfMonth: 5 }, 1))
      .rejects.toThrow('金额无效')
    await expect(fixedService.addFixed({ amountStr: '10', categoryId: lunch.id, dayOfMonth: 31 }, 1))
      .rejects.toThrow('记账日要选 1~28 号')
    await expect(fixedService.addFixed({ amountStr: '10', categoryId: 0, dayOfMonth: 5 }, 1))
      .rejects.toThrow('选一个分类嘛~')

    const id = await fixedService.addFixed({ amountStr: '1500', categoryId: lunch.id, dayOfMonth: 5, note: '房租' }, 1, T)
    const list = await fixedService.listFixed(1)
    expect(list.length).toBe(1)
    expect(list[0].amount_cents).toBe(150000)
    expect(list[0].last_posted_ym).toBe(ymOf(T)) // 置为当前月 → 本月不补记

    const r = await fixedService.postDueFixed(1, T)
    expect(r.posted).toBe(0) // 刚创建，当月不自动补
    expect(id).toBeGreaterThan(0)
  })

  it('postDueFixed：当月未记 → 自动补一笔支出并登记月份；重复调用不再补', async () => {
    const lunch = cats.find(function (c) { return c.name === '午餐' })
    // 手工造一条"上月已记"的配置 → 本月到期
    const store = getStorage()
    await store.fixedExpenseInsert({
      account_id: 1, category_id: lunch.id, amount_cents: 150000, note: '房租',
      day_of_month: 5, last_posted_ym: '2026-08', enabled: 1,
      created_at: T, updated_at: T
    })

    const r1 = await fixedService.postDueFixed(1, T)
    expect(r1.posted).toBe(1)
    expect(r1.items[0].amount_cents).toBe(150000)

    // 流水真的写进当月了
    const list = await fixedService.listFixed(1)
    expect(list[0].last_posted_ym).toBe('2026-09')
    const txs = await getStorage().txListByMonth(
      new Date(2026, 8, 1).getTime(), new Date(2026, 9, 1).getTime(), 1)
    expect(txs.length).toBe(1)
    expect(txs[0].type).toBe('expense')
    expect(txs[0].amount_cents).toBe(150000)

    // 同月再调一次 → 不重复
    const r2 = await fixedService.postDueFixed(1, T)
    expect(r2.posted).toBe(0)
  })

  it('停用的配置不补记；多账本互相隔离', async () => {
    const lunch = cats.find(function (c) { return c.name === '午餐' })
    const store = getStorage()
    await store.fixedExpenseInsert({
      account_id: 1, category_id: lunch.id, amount_cents: 100, note: '停用',
      day_of_month: 5, last_posted_ym: '', enabled: 0, created_at: T, updated_at: T
    })
    await store.fixedExpenseInsert({
      account_id: 2, category_id: lunch.id, amount_cents: 200, note: '另一账本',
      day_of_month: 5, last_posted_ym: '', enabled: 1, created_at: T, updated_at: T
    })

    const r = await fixedService.postDueFixed(1, T)
    expect(r.posted).toBe(0) // 停用的不补；账本 2 的配置不归账本 1 管

    const r2 = await fixedService.postDueFixed(2, T)
    expect(r2.posted).toBe(1)
  })

  it('toggle / update / remove 全链路', async () => {
    const lunch = cats.find(function (c) { return c.name === '午餐' })
    const id = await fixedService.addFixed({ amountStr: '15', categoryId: lunch.id, dayOfMonth: 5 }, 1)

    await fixedService.toggleFixed(id, false)
    expect((await fixedService.listFixed(1))[0].enabled).toBe(false)

    await fixedService.updateFixed(id, { amountStr: '25.5', note: '涨了' })
    const row = (await fixedService.listFixed(1))[0]
    expect(row.amount_cents).toBe(2550)
    expect(row.note).toBe('涨了')

    await expect(fixedService.updateFixed(id, { dayOfMonth: 30 })).rejects.toThrow('记账日要选 1~28 号')

    await fixedService.removeFixed(id)
    expect((await fixedService.listFixed(1)).length).toBe(0)
  })
})

describe('T2.3 —— 补记日期按配置日落位', () => {
  const T2 = new Date(2026, 8, 28, 9, 0, 0).getTime() // 2026-09-28 09:00

  it('postTsFor：落在目标月目标日的本地 12:00', () => {
    const ts = fixedService.postTsFor('2026-09', 5)
    const d = new Date(ts)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8) // 9 月（0 起制）
    expect(d.getDate()).toBe(5)
    expect(d.getHours()).toBe(12)
    expect(d.getMinutes()).toBe(0)
  })

  it('postTsFor：29~31 日钳制到月末（2 月无 30 号 → 落 2 月最后一天）', () => {
    const feb30 = new Date(fixedService.postTsFor('2026-02', 30))
    expect(feb30.getMonth()).toBe(1)
    expect(feb30.getDate()).toBe(28) // 2026 非闰年
    const leap = new Date(fixedService.postTsFor('2028-02', 31))
    expect(leap.getDate()).toBe(29) // 2028 闰年
    expect(new Date(fixedService.postTsFor('2026-04', 31)).getDate()).toBe(30)
  })

  it('missedMonths：跨月未打开 → 从上月下一月起逐月补到当月', () => {
    expect(fixedService.missedMonths('2026-06', '2026-09')).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(fixedService.missedMonths('2026-08', '2026-09')).toEqual(['2026-09'])
  })

  it('missedMonths：空/非法 last_posted → 只补当前月；时钟回拨 → 空数组', () => {
    expect(fixedService.missedMonths('', '2026-09')).toEqual(['2026-09'])
    expect(fixedService.missedMonths('垃圾', '2026-09')).toEqual(['2026-09'])
    expect(fixedService.missedMonths('2026-10', '2026-09')).toEqual([])
  })

  it('端到端：6 月记过、9 月才打开 → 补 7/8/9 三笔，分别落在各月 5 号 12:00，月份不再缺失', async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    await seedDefaultIfEmpty()
    const id = await fixedService.addFixed(
      { amountStr: '1500', dayOfMonth: 5, categoryId: 1, note: '房租' }, 1,
      new Date(2026, 5, 5, 10, 0, 0).getTime() // 2026-06-05 创建，last_posted_ym = 2026-06
    )
    const r = await fixedService.postDueFixed(1, T2) // 2026-09-28 才打开
    expect(r.posted).toBe(3)
    expect(r.items.map(function (i) { return i.ym })).toEqual(['2026-07', '2026-08', '2026-09'])

    const s = getStorage()
    const rows = await s.txListByRange(0, 99999999999999, 1)
    expect(rows.length).toBe(3)
    const days = rows.map(function (r2) {
      const d = new Date(r2.occurred_at)
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }).sort()
    expect(days).toEqual(['2026-07-05', '2026-08-05', '2026-09-05'])
    rows.forEach(function (r2) { expect(new Date(r2.occurred_at).getHours()).toBe(12) })

    // 幂等：同月再跑一次不再补
    const again = await fixedService.postDueFixed(1, T2)
    expect(again.posted).toBe(0)
    expect((await s.txListByRange(0, 99999999999999, 1)).length).toBe(3)
    void id
  })
})

describe('T3.5 —— 固定支出编辑', () => {
  const T = new Date(2026, 8, 28, 9, 0, 0).getTime() // 2026-09-28
  const T2 = new Date(2026, 9, 20, 9, 0, 0).getTime() // 2026-10-20
  let cats
  let lunch
  let home

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    await seedDefaultIfEmpty()
    cats = await listCats()
    lunch = cats.find(function (c) { return c.name === '午餐' })
    home = cats.find(function (c) { return c.name === '居住' })
  })

  it('金额 / 记账日 / 备注 / 分类 / 启停 都能改到', async () => {
    const id = await fixedService.addFixed({ amountStr: '15', categoryId: lunch.id, dayOfMonth: 5 }, 1, T)

    await fixedService.updateFixed(id, {
      amountStr: '1234.56',
      dayOfMonth: 20,
      note: '涨租了',
      categoryId: home.id,
      enabled: false
    })

    const row = (await fixedService.listFixed(1))[0]
    expect(row.amount_cents).toBe(123456)
    expect(row.day_of_month).toBe(20)
    expect(row.note).toBe('涨租了')
    expect(row.category_id).toBe(home.id)
    expect(row.enabled).toBe(false)
  })

  it('编辑不重置 last_posted_ym：本月已记的那笔不会被重复补记', async () => {
    const id = await fixedService.addFixed({ amountStr: '15', categoryId: lunch.id, dayOfMonth: 5 }, 1, T)
    await fixedService.updateFixed(id, { amountStr: '30', dayOfMonth: 8 })

    expect((await fixedService.listFixed(1))[0].last_posted_ym).toBe(ymOf(T))
    // 当月再跑补记：仍然 0 笔（编辑不该让本月重新记一遍）
    expect((await fixedService.postDueFixed(1, T)).posted).toBe(0)
    expect((await txService.listByMonth(ymOf(T), 1)).length).toBe(0)
  })

  it('改完之后，下个月的自动记账按新配置执行（金额与新记账日）', async () => {
    const id = await fixedService.addFixed({ amountStr: '15', categoryId: lunch.id, dayOfMonth: 5 }, 1, T)
    await fixedService.updateFixed(id, { amountStr: '30', dayOfMonth: 8, note: '改过了' })

    const r = await fixedService.postDueFixed(1, T2)
    expect(r.posted).toBe(1)

    const oct = await txService.listByMonth('2026-10', 1)
    expect(oct.length).toBe(1)
    expect(oct[0].amount_cents).toBe(3000)
    expect(oct[0].note).toBe('改过了')
    expect(new Date(oct[0].occurred_at).getDate()).toBe(8)
    expect(new Date(oct[0].occurred_at).getHours()).toBe(12)
  })

  it('校验失败时拒绝写入，原配置保持不变', async () => {
    const id = await fixedService.addFixed({ amountStr: '15', categoryId: lunch.id, dayOfMonth: 5 }, 1, T)

    await expect(fixedService.updateFixed(id, { amountStr: '0' })).rejects.toThrow('金额无效')
    await expect(fixedService.updateFixed(id, { amountStr: 'abc' })).rejects.toThrow('金额无效')
    await expect(fixedService.updateFixed(id, { dayOfMonth: 31 })).rejects.toThrow('记账日要选 1~28 号')
    await expect(fixedService.updateFixed(id, { categoryId: null })).rejects.toThrow('分类不能为空')

    const row = (await fixedService.listFixed(1))[0]
    expect(row.amount_cents).toBe(1500)
    expect(row.day_of_month).toBe(5)
    expect(row.category_id).toBe(lunch.id)
  })
})
