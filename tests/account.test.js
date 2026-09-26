import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats } from '../src/services/category.js'
import * as accountService from '../src/services/account.js'
import * as txService from '../src/services/tx.js'
import { resetAll } from '../src/services/maintenance.js'
import { ymOf } from '../src/utils/date.js'

/**
 * 多账本：默认账本种子、账本隔离、增删改。
 * 隔离是这次最需要钉住的地方 —— 一旦漏了 account_id 过滤，
 * 两个账本的流水会串在一起，而且不容易肉眼发现。
 */
describe('多账本', () => {
  let ym
  let expenseCat
  let incomeCat

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    await accountService.seedDefaultIfEmpty()
    ym = ymOf(Date.now())
    const cats = await listCats()
    expenseCat = cats.find(function (c) { return c.type === 'expense' })
    incomeCat = cats.find(function (c) { return c.type === 'income' })
  })

  describe('默认账本', () => {
    it('空库时种出「日常账本」，id 为 1（与流水表默认值一致）', async () => {
      const list = await accountService.listWithStats()
      expect(list.length).toBe(1)
      expect(list[0].id).toBe(1)
      expect(list[0].name).toBe('日常账本')
      expect(list[0].count).toBe(0)
      expect(list[0].balanceCents).toBe(0)
    })

    it('幂等：重复播种不会多出账本', async () => {
      await accountService.seedDefaultIfEmpty()
      await accountService.seedDefaultIfEmpty()
      expect((await accountService.listWithStats()).length).toBe(1)
    })

    it('不带 accountId 的流水自动归到默认账本（老数据迁移口径）', async () => {
      await txService.addTx({ amountStr: '10', categoryId: expenseCat.id, type: 'expense', ts: Date.now() })
      const list = await accountService.listWithStats()
      expect(list[0].count).toBe(1)
      expect(list[0].expenseCents).toBe(1000)
    })
  })

  describe('新建 / 改名 / 删除', () => {
    it('新建后可查到，且名字首尾空格被去掉', async () => {
      await accountService.create('  旅行基金  ')
      const list = await accountService.listWithStats()
      expect(list.length).toBe(2)
      expect(list[1].name).toBe('旅行基金')
    })

    it('名字不能为空 / 超 12 字', async () => {
      await expect(accountService.create('   ')).rejects.toThrow('不能为空')
      await expect(accountService.create('一二三四五六七八九十十一十二十三')).rejects.toThrow('最多 12 个字')
    })

    it('改名生效', async () => {
      const id = (await accountService.listWithStats())[0].id
      await accountService.rename(id, '生活费')
      expect((await accountService.listWithStats())[0].name).toBe('生活费')
    })

    it('空账本可以删，有记录的不许删（并提示还有几笔）', async () => {
      await accountService.create('空账本')
      const list1 = await accountService.listWithStats()
      const empty = list1.find(function (a) { return a.name === '空账本' })
      await accountService.removeIfEmpty(empty.id)
      expect((await accountService.listWithStats()).length).toBe(1)

      // 默认账本里放一笔后再删 → 拒绝
      await txService.addTx({ amountStr: '10', categoryId: expenseCat.id, type: 'expense', ts: Date.now() })
      await expect(accountService.removeIfEmpty(1)).rejects.toThrow('还有 1 笔记录')
    })
  })

  describe('账本隔离（最关键）', () => {
    let travelId

    beforeEach(async () => {
      // 默认账本 1 记一笔，再建一个账本记另一笔（id 动态取，不假设是 2）
      await txService.addTx({ amountStr: '10', categoryId: expenseCat.id, type: 'expense', ts: Date.now() })
      await accountService.create('旅行基金')
      const two = (await accountService.listWithStats()).find(function (a) { return a.name === '旅行基金' })
      travelId = two.id
      await txService.addTx({
        amountStr: '200',
        categoryId: expenseCat.id,
        type: 'expense',
        ts: Date.now(),
        accountId: travelId
      })
    })

    it('列表按账本过滤：各看各的', async () => {
      const list1 = await txService.listByMonth(ym, 1)
      const list2 = await txService.listByMonth(ym, travelId)
      expect(list1.length).toBe(1)
      expect(list1[0].amount_cents).toBe(1000)
      expect(list2.length).toBe(1)
      expect(list2[0].amount_cents).toBe(20000)
    })

    it('月合计按账本隔离', async () => {
      expect((await txService.monthSummary(ym, 1)).expenseCents).toBe(1000)
      expect((await txService.monthSummary(ym, travelId)).expenseCents).toBe(20000)
    })

    it('全量概览按账本隔离', async () => {
      expect((await txService.overview(1)).expenseCents).toBe(1000)
      expect((await txService.overview(travelId)).expenseCents).toBe(20000)
      expect((await txService.overview(1)).totalCount).toBe(1)
    })

    it('连续天数样本按账本隔离', async () => {
      const since = Date.now() - 86400000 * 2
      expect((await txService.recentTimestamps(since, 1)).length).toBe(1)
      expect((await txService.recentTimestamps(since, travelId)).length).toBe(1)
    })

    it('账本列表的统计各不相同', async () => {
      const list = await accountService.listWithStats()
      const a1 = list.find(function (a) { return a.id === 1 })
      const a2 = list.find(function (a) { return a.name === '旅行基金' })
      expect(a1.expenseCents).toBe(1000)
      expect(a2.expenseCents).toBe(20000)
      expect(a1.balanceCents).toBe(-1000)
      expect(a1.lastAt).toBeTruthy()
    })

    it('删掉一个账本后，另一个账本的数据不受影响', async () => {
      await txService.removeTx((await txService.listByMonth(ym, travelId))[0].id)
      await accountService.removeIfEmpty(travelId)
      expect((await txService.listByMonth(ym, 1)).length).toBe(1)
      expect((await accountService.listWithStats()).length).toBe(1)
    })
  })

  describe('重置数据要把账本也恢复', () => {
    it('重置后只剩默认账本，且分类与账本都能立刻用', async () => {
      await accountService.create('旅行基金')
      await txService.addTx({ amountStr: '10', categoryId: expenseCat.id, type: 'expense', ts: Date.now() })
      await resetAll()

      const accounts = await accountService.listWithStats()
      expect(accounts.length).toBe(1)
      expect(accounts[0].id).toBe(1)
      expect(accounts[0].count).toBe(0)
      expect((await listCats()).length).toBe(20)

      // 重置后还能正常记账
      await txService.addTx({ amountStr: '1', categoryId: incomeCat.id, type: 'income', ts: Date.now() })
      expect((await txService.listByMonth(ym, 1)).length).toBe(1)
    })
  })
})
