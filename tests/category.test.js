import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import * as categoryService from '../src/services/category.js'
import * as txService from '../src/services/tx.js'
import { colorOf, iconMaskStyle } from '../src/utils/palette.js'
import { ymOf } from '../src/utils/date.js'

describe('分类管理（增删改 + 排序）', () => {
  let ym
  let expense
  let income

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await categoryService.seedIfEmpty()
    ym = ymOf(Date.now())
    const all = await categoryService.listAll()
    expense = all.filter(function (c) { return c.type === 'expense' })
    income = all.filter(function (c) { return c.type === 'income' })
  })

  describe('新建', () => {
    it('排在所属类型的最后（sort 接在最大值之后）', async () => {
      await categoryService.create({ name: '宠物', type: 'expense', icon: 'fun' })
      const all = await categoryService.listWithStats()
      const mine = all.find(function (c) { return c.name === '宠物' })
      expect(mine.type).toBe('expense')
      expect(mine.sort).toBe(expense.length + 1)
      // 收入那侧不受影响
      expect(all.filter(function (c) { return c.type === 'income' }).length).toBe(income.length)
    })

    it('新分类能取到颜色与图标（不会退回 emoji）—— icon key 必须来自已有清单', async () => {
      await categoryService.create({ name: '宠物', type: 'expense', icon: 'fun' })
      const mine = (await categoryService.listAll()).find(function (c) { return c.name === '宠物' })
      expect(colorOf(mine)).toMatch(/^#[0-9a-f]{6}$/)
      expect(iconMaskStyle(mine)).toBeTruthy()
    })

    it('名称校验：空 / 超 6 字都拦下', async () => {
      await expect(categoryService.create({ name: '  ', type: 'expense', icon: 'fun' })).rejects.toThrow('不能为空')
      await expect(categoryService.create({ name: '一二三四五六七', type: 'expense', icon: 'fun' })).rejects.toThrow('最多 6 个字')
      expect((await categoryService.listAll()).length).toBe(20)
    })

    it('图标必须从已有清单里选（否则取不到配色）', async () => {
      await expect(categoryService.create({ name: '宠物', type: 'expense', icon: '🐶' })).rejects.toThrow('请选择一个图标')
      await expect(categoryService.create({ name: '宠物', type: 'expense', icon: 'unknown-key' })).rejects.toThrow('请选择一个图标')
    })

    it('类型不合法时拒绝', async () => {
      await expect(categoryService.create({ name: '宠物', type: 'transfer', icon: 'fun' })).rejects.toThrow('类型不合法')
    })

    it('可选图标清单就是参考包的 19 个', () => {
      expect(categoryService.iconOptions().length).toBe(19)
    })
  })

  describe('改名 / 换图标', () => {
    it('改名生效并去掉首尾空格', async () => {
      await categoryService.rename(expense[0].id, '  早饭  ')
      expect((await categoryService.listAll()).find(function (c) { return c.id === expense[0].id }).name).toBe('早饭')
    })

    it('换图标生效', async () => {
      await categoryService.setIcon(expense[0].id, 'gift')
      expect((await categoryService.listAll()).find(function (c) { return c.id === expense[0].id }).icon).toBe('gift')
    })

    it('改名同样受名称校验约束', async () => {
      await expect(categoryService.rename(expense[0].id, '')).rejects.toThrow('不能为空')
    })
  })

  describe('排序', () => {
    it('下移一位：与后一个交换', async () => {
      const ids = expense.map(function (c) { return c.id })
      await categoryService.move(ids[0], 1)
      const after = (await categoryService.listAll())
        .filter(function (c) { return c.type === 'expense' })
        .map(function (c) { return c.id })
      expect(after[0]).toBe(ids[1])
      expect(after[1]).toBe(ids[0])
    })

    it('上移一位：与前一个交换', async () => {
      const ids = expense.map(function (c) { return c.id })
      await categoryService.move(ids[2], -1)
      const after = (await categoryService.listAll())
        .filter(function (c) { return c.type === 'expense' })
        .map(function (c) { return c.id })
      expect(after[1]).toBe(ids[2])
      expect(after[2]).toBe(ids[1])
    })

    it('到顶/到底静默不动，返回 false', async () => {
      const ids = expense.map(function (c) { return c.id })
      expect(await categoryService.move(ids[0], -1)).toBe(false)
      expect(await categoryService.move(ids[ids.length - 1], 1)).toBe(false)
    })

    it('排序不会跨类型影响收入列表', async () => {
      const incomeIds = income.map(function (c) { return c.id })
      await categoryService.move(expense[0].id, 1)
      const incomeAfter = (await categoryService.listAll())
        .filter(function (c) { return c.type === 'income' })
        .map(function (c) { return c.id })
      expect(incomeAfter).toEqual(incomeIds)
    })

    it('排序后 sort 连续编号（1..n），不留空洞', async () => {
      await categoryService.move(expense[3].id, -1)
      const sorts = (await categoryService.listAll())
        .filter(function (c) { return c.type === 'expense' })
        .map(function (c) { return c.sort })
      expect(sorts).toEqual(Array.from({ length: expense.length }, function (_v, i) { return i + 1 }))
    })
  })

  describe('删除（有流水就不让删）', () => {
    it('空分类可以删，删完 sort 依然连续', async () => {
      await categoryService.create({ name: '宠物', type: 'expense', icon: 'fun' })
      const mine = (await categoryService.listAll()).find(function (c) { return c.name === '宠物' })
      await categoryService.removeIfEmpty(mine.id)
      const left = (await categoryService.listWithStats()).filter(function (c) { return c.type === 'expense' })
      expect(left.length).toBe(expense.length)
      expect(left.map(function (c) { return c.sort }))
        .toEqual(Array.from({ length: expense.length }, function (_v, i) { return i + 1 }))
    })

    it('分类下有流水 → 拒绝删除，并说清还有几笔', async () => {
      await txService.addTx({ amountStr: '10', categoryId: expense[0].id, type: 'expense', ts: Date.now() })
      await txService.addTx({ amountStr: '20', categoryId: expense[0].id, type: 'expense', ts: Date.now() })
      await expect(categoryService.removeIfEmpty(expense[0].id)).rejects.toThrow('还有 2 笔记录')
      expect((await categoryService.listAll()).length).toBe(20)
    })

    it('流水被软删除后（不再计入），分类就可以删了', async () => {
      await txService.addTx({ amountStr: '10', categoryId: expense[0].id, type: 'expense', ts: Date.now() })
      const list = await txService.listByMonth(ym, 1)
      await txService.removeTx(list[0].id)
      await categoryService.removeIfEmpty(expense[0].id)
      expect((await categoryService.listAll()).length).toBe(19)
    })
  })

  describe('列表统计', () => {
    it('listWithStats 给出每个分类的笔数，没记录的是 0', async () => {
      await txService.addTx({ amountStr: '10', categoryId: expense[0].id, type: 'expense', ts: Date.now() })
      const all = await categoryService.listWithStats()
      expect(all.find(function (c) { return c.id === expense[0].id }).count).toBe(1)
      expect(all.find(function (c) { return c.id === expense[1].id }).count).toBe(0)
    })
  })
})
