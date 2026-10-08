import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import * as categoryRepo from '../src/db/repository/category.js'
import * as categoryService from '../src/services/category.js'
import * as txService from '../src/services/tx.js'
import * as fixedService from '../src/services/fixed.js'
import * as budgetService from '../src/services/budget.js'
import * as accountService from '../src/services/account.js'
import { colorOf, iconMaskStyle } from '../src/utils/palette.js'
import { ymOf } from '../src/utils/date.js'

const S = categoryService

/** 从扁平清单里取某类型的一级 / 二级 */
function tops(list, type) { return S.topLevelOf(list, type) }
function kids(list, id) { return S.childrenOf(list, id) }

describe('分类管理（两级结构 + 增删改 + 排序）', () => {
  let ym
  let all
  let expense
  let income
  let expenseTops

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await categoryService.seedIfEmpty()
    await accountService.seedDefaultIfEmpty()
    ym = ymOf(Date.now())
    all = await categoryService.listAll()
    expense = all.filter(function (c) { return c.type === 'expense' })
    income = all.filter(function (c) { return c.type === 'income' })
    expenseTops = tops(all, 'expense')
  })

  describe('两级结构（种子）', () => {
    it('支出是一级 + 二级，收入保持一级平铺', async () => {
      expect(expense.length).toBe(S.DEFAULT_EXPENSE_COUNT)
      expect(income.length).toBe(S.DEFAULT_INCOME_COUNT)
      expect(all.length).toBe(S.DEFAULT_CATEGORY_COUNT)
      // 收入全部是一级
      expect(income.every(function (c) { return c.parent_id == null })).toBe(true)
      // 支出里既有一级也有二级
      expect(expenseTops.length).toBe(S.EXPENSE_TREE.length)
      expect(expense.some(function (c) { return c.parent_id != null })).toBe(true)
    })

    it('每个二级都挂在一个**同类型的一级**上（没有孤儿、没有跨类型）', () => {
      const byId = new Map(all.map(function (c) { return [c.id, c] }))
      expense
        .filter(function (c) { return c.parent_id != null })
        .forEach(function (c) {
          const p = byId.get(c.parent_id)
          expect(p, c.name + ' 的上级不存在').toBeTruthy()
          expect(p.type).toBe('expense')
          expect(p.parent_id).toBe(null)
        })
    })

    it('一级的 icon 各不相同（统计页按一级汇总时色块不会撞车）', () => {
      const keys = expenseTops.map(function (c) { return c.icon })
      expect(new Set(keys).size).toBe(keys.length)
    })

    it('buildTree 给出 一级 + children，且 children 的 parent_id 一一对应', () => {
      const tree = S.buildTree(all, 'expense')
      expect(tree.length).toBe(expenseTops.length)
      tree.forEach(function (node) {
        node.children.forEach(function (c) { expect(c.parent_id).toBe(node.cat.id) })
      })
    })

    it('buildTree 遇到孤儿二级（父级被删）时把它提升成一级，不丢分类', () => {
      const list = [
        { id: 1, name: '餐饮', type: 'expense', icon: 'food', sort: 1, parent_id: null },
        { id: 2, name: '孤儿', type: 'expense', icon: 'food', sort: 2, parent_id: 999 }
      ]
      const tree = S.buildTree(list, 'expense')
      expect(tree.map(function (n) { return n.cat.name })).toEqual(['餐饮'])
      expect(S.childrenOf(list, 999).map(function (c) { return c.name })).toEqual(['孤儿'])
    })
  })

  describe('新建', () => {
    it('建一级：排在支出一级的最后一位', async () => {
      await categoryService.create({ name: '健身', type: 'expense', icon: 'fun' })
      const mine = (await categoryService.listAll()).find(function (c) { return c.name === '健身' })
      expect(mine.parent_id).toBe(null)
      const t = tops(await categoryService.listAll(), 'expense')
      expect(mine.sort).toBe(t.length)
    })

    it('建二级：挂到指定一级下，排在**该组**最后一位', async () => {
      const food = tops(all, 'expense').find(function (c) { return c.name === '餐饮' })
      const before = kids(all, food.id).length
      await categoryService.create({ name: '夜宵', type: 'expense', icon: 'snack', parentId: food.id })
      const after = await categoryService.listAll()
      const mine = after.find(function (c) { return c.name === '夜宵' })
      expect(mine.parent_id).toBe(food.id)
      expect(mine.sort).toBe(before + 1)
      // 不会污染支出一级的数量
      expect(tops(after, 'expense').length).toBe(expenseTops.length)
    })

    it('parentId 指向收入分类 → 拒绝（不能跨类型挂）', async () => {
      const salary = tops(all, 'income').find(function (c) { return c.name === '工资' })
      await expect(
        categoryService.create({ name: '夜宵', type: 'expense', icon: 'snack', parentId: salary.id })
      ).rejects.toThrow('不能挂到其它类型的分类下')
    })

    it('parentId 指向二级 → 拒绝（最多两级）', async () => {
      const breakfast = all.find(function (c) { return c.name === '早餐' && c.type === 'expense' })
      expect(breakfast.parent_id).not.toBe(null)
      await expect(
        categoryService.create({ name: '夜宵', type: 'expense', icon: 'snack', parentId: breakfast.id })
      ).rejects.toThrow('最多两级')
    })

    it('parentId 不存在 → 拒绝', async () => {
      await expect(
        categoryService.create({ name: '夜宵', type: 'expense', icon: 'snack', parentId: 99999 })
      ).rejects.toThrow('上级分类不存在')
    })

    it('名称校验：空 / 超 6 字都拦下', async () => {
      const n = (await categoryService.listAll()).length
      await expect(categoryService.create({ name: '  ', type: 'expense', icon: 'fun' })).rejects.toThrow('不能为空')
      await expect(categoryService.create({ name: '一二三四五六七', type: 'expense', icon: 'fun' })).rejects.toThrow('最多 6 个字')
      expect((await categoryService.listAll()).length).toBe(n)
    })

    it('图标必须从已有清单里选（否则取不到配色）', async () => {
      await expect(categoryService.create({ name: '夜宵', type: 'expense', icon: '🐶' })).rejects.toThrow('请选择一个图标')
      await expect(categoryService.create({ name: '夜宵', type: 'expense', icon: 'unknown-key' })).rejects.toThrow('请选择一个图标')
    })

    it('类型不合法时拒绝', async () => {
      await expect(categoryService.create({ name: '夜宵', type: 'transfer', icon: 'fun' })).rejects.toThrow('类型不合法')
    })

    it('新分类能取到颜色与图标（不会退回 emoji）', async () => {
      const food = expenseTops.find(function (c) { return c.name === '餐饮' })
      await categoryService.create({ name: '夜宵', type: 'expense', icon: 'snack', parentId: food.id })
      const mine = (await categoryService.listAll()).find(function (c) { return c.name === '夜宵' })
      expect(colorOf(mine)).toMatch(/^#[0-9a-f]{6}$/)
      expect(iconMaskStyle(mine)).toBeTruthy()
    })
  })

  describe('改名 / 换图标', () => {
    let target
    beforeEach(function () {
      target = all.find(function (c) { return c.name === '早餐' && c.type === 'expense' })
    })

    it('改名生效并去掉首尾空格，父子关系不变', async () => {
      await categoryService.rename(target.id, '  早饭  ')
      const after = (await categoryService.listAll()).find(function (c) { return c.id === target.id })
      expect(after.name).toBe('早饭')
      expect(after.parent_id).toBe(target.parent_id)
    })

    it('换图标生效', async () => {
      await categoryService.setIcon(target.id, 'gift')
      expect((await categoryService.listAll()).find(function (c) { return c.id === target.id }).icon).toBe('gift')
    })

    it('改名同样受名称校验约束', async () => {
      await expect(categoryService.rename(target.id, '')).rejects.toThrow('不能为空')
    })
  })

  describe('排序（只在同组内）', () => {
    let food
    let foodKids

    beforeEach(function () {
      food = expenseTops.find(function (c) { return c.name === '餐饮' })
      foodKids = kids(all, food.id)
    })

    it('一级下移一位：与下一个一级交换', async () => {
      const ids = expenseTops.map(function (c) { return c.id })
      await categoryService.move(ids[0], 1)
      const after = tops(await categoryService.listAll(), 'expense').map(function (c) { return c.id })
      expect(after[0]).toBe(ids[1])
      expect(after[1]).toBe(ids[0])
    })

    it('二级下移一位：与同组的下一个二级交换', async () => {
      const ids = foodKids.map(function (c) { return c.id })
      await categoryService.move(ids[0], 1)
      const after = kids(await categoryService.listAll(), food.id).map(function (c) { return c.id })
      expect(after[0]).toBe(ids[1])
      expect(after[1]).toBe(ids[0])
    })

    it('二级排序不会影响其它一级下的二级（分组隔离）', async () => {
      const traffic = expenseTops.find(function (c) { return c.name === '交通' })
      const before = kids(all, traffic.id).map(function (c) { return c.id })
      await categoryService.move(foodKids[0].id, 1)
      const after = kids(await categoryService.listAll(), traffic.id).map(function (c) { return c.id })
      expect(after).toEqual(before)
    })

    it('二级排序不会打乱一级的顺序', async () => {
      const before = expenseTops.map(function (c) { return c.id })
      await categoryService.move(foodKids[0].id, 1)
      const after = tops(await categoryService.listAll(), 'expense').map(function (c) { return c.id })
      expect(after).toEqual(before)
    })

    it('到顶/到底静默不动，返回 false', async () => {
      const topIds = expenseTops.map(function (c) { return c.id })
      expect(await categoryService.move(topIds[0], -1)).toBe(false)
      expect(await categoryService.move(topIds[topIds.length - 1], 1)).toBe(false)
      const kidIds = foodKids.map(function (c) { return c.id })
      expect(await categoryService.move(kidIds[0], -1)).toBe(false)
      expect(await categoryService.move(kidIds[kidIds.length - 1], 1)).toBe(false)
    })

    it('排序后**同组内** sort 连续编号（1..n），不留空洞', async () => {
      await categoryService.move(foodKids[2].id, -1)
      const after = await categoryService.listAll()
      kids(after, food.id).forEach(function (c, i) { expect(c.sort).toBe(i + 1) })
      tops(after, 'expense').forEach(function (c, i) { expect(c.sort).toBe(i + 1) })
    })

    it('排序不会跨类型影响收入列表', async () => {
      const incomeIds = income.map(function (c) { return c.id })
      await categoryService.move(expenseTops[0].id, 1)
      const incomeAfter = (await categoryService.listAll())
        .filter(function (c) { return c.type === 'income' })
        .map(function (c) { return c.id })
      expect(incomeAfter).toEqual(incomeIds)
    })
  })

  describe('删除（有子级 / 有流水都不让删）', () => {
    it('一级下还挂着二级 → 拒绝，并说清有几个子分类', async () => {
      const food = expenseTops.find(function (c) { return c.name === '餐饮' })
      const n = kids(all, food.id).length
      await expect(categoryService.removeIfEmpty(food.id)).rejects.toThrow('还有 ' + n + ' 个子分类')
    })

    it('空的一级（无子无流水）可以删，删完一级 sort 依然连续', async () => {
      await categoryService.create({ name: '健身', type: 'expense', icon: 'fun' })
      const mine = (await categoryService.listAll()).find(function (c) { return c.name === '健身' })
      await categoryService.removeIfEmpty(mine.id)
      const after = await categoryService.listAll()
      expect(after.length).toBe(all.length)
      tops(after, 'expense').forEach(function (c, i) { expect(c.sort).toBe(i + 1) })
    })

    it('空的二级可以删，删完**组内** sort 依然连续', async () => {
      const food = expenseTops.find(function (c) { return c.name === '餐饮' })
      const target = kids(all, food.id)[1]
      const groupSize = kids(all, food.id).length
      await categoryService.removeIfEmpty(target.id)
      const after = await categoryService.listAll()
      expect(after.length).toBe(all.length - 1)
      const rest = kids(after, food.id)
      expect(rest.length).toBe(groupSize - 1)
      rest.forEach(function (c, i) { expect(c.sort).toBe(i + 1) })
    })

    it('分类下有流水 → 拒绝删除，并说清还有几笔', async () => {
      const target = kids(all, expenseTops.find(function (c) { return c.name === '餐饮' }).id)[0]
      await txService.addTx({ amountStr: '10', categoryId: target.id, type: 'expense', ts: Date.now() })
      await txService.addTx({ amountStr: '20', categoryId: target.id, type: 'expense', ts: Date.now() })
      await expect(categoryService.removeIfEmpty(target.id)).rejects.toThrow('还有 2 笔记录')
      expect((await categoryService.listAll()).length).toBe(all.length)
    })

    it('流水被软删除后（不再计入），分类就可以删了', async () => {
      const target = kids(all, expenseTops.find(function (c) { return c.name === '餐饮' }).id)[0]
      await txService.addTx({ amountStr: '10', categoryId: target.id, type: 'expense', ts: Date.now() })
      const list = await txService.listByMonth(ym, 1)
      await txService.removeTx(list[0].id)
      await categoryService.removeIfEmpty(target.id)
      expect((await categoryService.listAll()).length).toBe(all.length - 1)
    })
  })

  describe('countRefs —— 数固定支出 / 预算引用（纯函数）', () => {
    it('空表 / 非数组 → 全0（不炸）', () => {
      expect(S.countRefs([], [], 1)).toEqual({ fixed: 0, budget: 0 })
      expect(S.countRefs(null, undefined, 1)).toEqual({ fixed: 0, budget: 0 })
    })

    it('只数category_id 对上的那些', () => {
      const r = S.countRefs(
        [{ category_id: 7 }, { category_id: 8 }, { category_id: 7 }],
        [{ category_id: 7 }, { category_id: 9 }],
        7
      )
      expect(r).toEqual({ fixed: 2, budget: 1 })
    })

    it('总预算（category_id 为 null）不算引用 —— null 不能被当成0', () => {
      // ⚠️ 这是真实踩过的坑方向：`Number(null)===0`，若不做 != null 判断，
      // 删 id=0 或判0 号分类时总预算会被误算成引用。
      expect(S.countRefs([], [{ category_id: null }], 0)).toEqual({ fixed: 0, budget: 0 })
      expect(S.countRefs([], [{ category_id: null }], null)).toEqual({ fixed: 0, budget: 0 })
      expect(S.countRefs([], [{ category_id: 0 }], 0)).toEqual({ fixed: 0, budget: 1 })
    })

    it('字符串 id 与数字 id 视为同一个（DB/页面可能给字符串）', () => {
      expect(S.countRefs([{ category_id: '7' }], [{ category_id: '7' }], 7))
        .toEqual({ fixed: 1, budget: 1 })
    })
  })

  describe('删除保护：固定支出 / 预算的引用（孤儿引用防线）', () => {
    /** 找一个空的二级（无子无流水），专门用来做删除实验 */
    async function emptyChild() {
      const list = await categoryService.listAll()
      const top = S.topLevelOf(list, 'expense').find(function (c) { return c.name === '购物' })
      return S.childrenOf(list, top.id)[0]
    }

    it('被固定支出引用 → 拒绝删除，并说清有几笔', async () => {
      const target = await emptyChild()
      await fixedService.addFixed({ amountStr: '30', categoryId: target.id, dayOfMonth: 5 }, 1, Date.now())
      await expect(categoryService.removeIfEmpty(target.id)).rejects.toThrow('固定支出')
      expect((await categoryService.listAll()).some(function (c) { return c.id === target.id })).toBe(true)
    })

    it('设了分类预算 → 拒绝删除', async () => {
      const target = await emptyChild()
      await budgetService.setCategory(1, target.id, '100')
      await expect(categoryService.removeIfEmpty(target.id)).rejects.toThrow('预算')
      expect((await categoryService.listAll()).some(function (c) { return c.id === target.id })).toBe(true)
    })

    it('⭐ 引用在**别的账本**下也一样拦得住（分类是全局的，引用不是）', async () => {
      const target = await emptyChild()
      // 建第二个账本，把固定支出 + 预算都挂到它下面
      const acc2 = await accountService.create('旅行账本')
      expect(acc2.id).not.toBe(1)
      const fxId = await fixedService.addFixed({ amountStr: '30', categoryId: target.id, dayOfMonth: 5 }, acc2.id, Date.now())

      // 当前账本是 1，仍应被拦住 —— 否则就造出了「A 账本删分类弄坏 B 账本」的孤儿
      await expect(categoryService.removeIfEmpty(target.id)).rejects.toThrow('固定支出')

      // 预算也挂在别的账本下，同样拦得住
      await fixedService.removeFixed(fxId)
      await budgetService.setCategory(acc2.id, target.id, '88')
      await expect(categoryService.removeIfEmpty(target.id)).rejects.toThrow('预算')

      // 清掉之后就能删了（证明确实是「查到了才拦」，不是无条件拒绝）
      await budgetService.setCategory(acc2.id, target.id, '')
      await categoryService.removeIfEmpty(target.id)
      expect((await categoryService.listAll()).some(function (c) { return c.id === target.id })).toBe(false)
    })

    it('先把引用清掉，分类就能删了（不是死锁）', async () => {
      const target = await emptyChild()
      const fxId = await fixedService.addFixed({ amountStr: '30', categoryId: target.id, dayOfMonth: 5 }, 1, Date.now())
      await budgetService.setCategory(1, target.id, '100')
      await expect(categoryService.removeIfEmpty(target.id)).rejects.toThrow()

      await fixedService.removeFixed(fxId)
      await budgetService.setCategory(1, target.id, '')   // 空串 = 清除预算
      await categoryService.removeIfEmpty(target.id)
      expect((await categoryService.listAll()).some(function (c) { return c.id === target.id })).toBe(false)
    })

    it('停用（enabled=false）的固定支出**仍然**拦着 —— 配置还在，删了就成孤儿', async () => {
      const target = await emptyChild()
      const fxId = await fixedService.addFixed({ amountStr: '30', categoryId: target.id, dayOfMonth: 5 }, 1, Date.now())
      await fixedService.toggleFixed(fxId, false)
      await expect(categoryService.removeIfEmpty(target.id)).rejects.toThrow('固定支出')
    })
  })

  describe('固定支出不会被删掉的分类静默补记（老数据的悬挂引用）', () => {
    it('分类被删后，固定支出仍会按月补记出category_id 悬空的流水（已知退化，需如实告知）', async () => {
      // 复现「v2.3.19 之前」的老数据状态：先建配置，再绕过保护直接删掉分类。
      // 这条断言是把当前真实行为钉住，防止以后有人误以为已经不发生了。
      const list = await categoryService.listAll()
      const top = S.topLevelOf(list, 'expense').find(function (c) { return c.name === '购物' })
      const target = S.childrenOf(list, top.id)[0]
      // 建在 2026-09 → last_posted_ym='2026-09'，跑 10 月时它才是「到期」的
      const created = new Date(2026, 8, 20, 12, 0, 0).getTime()
      await fixedService.addFixed({ amountStr: '30', categoryId: target.id, dayOfMonth: 5 }, 1, created)

      await categoryRepo.remove(target.id)          // 硬删，模拟老版本删干净了
      const after = await categoryService.listAll()
      expect(after.some(function (c) { return c.id === target.id })).toBe(false)

      // 补记仍会发生，且写进去的 category_id 指向不存在的分类
      const r = await fixedService.postDueFixed(1, new Date(2026, 9, 20, 12, 0, 0).getTime())
      expect(r.posted).toBeGreaterThan(0)
      const recs = await txService.listByMonth('2026-10', 1)
      const orphan = recs.filter(function (t) { return t.category_id === target.id })
      expect(orphan.length).toBeGreaterThan(0)
      // 页面上拿不到名字 → fixed.vue 显示「分类已删除」（不再含糊成「其他」）
      expect(after.length).toBeGreaterThan(0)
    })
  })

  describe('列表统计', () => {
    it('listWithStats 给出每个分类的笔数，没记录的是 0', async () => {
      const food = expenseTops.find(function (c) { return c.name === '餐饮' })
      const [a, b] = kids(all, food.id)
      await txService.addTx({ amountStr: '10', categoryId: a.id, type: 'expense', ts: Date.now() })
      const rows = await categoryService.listWithStats()
      expect(rows.find(function (c) { return c.id === a.id }).count).toBe(1)
      expect(rows.find(function (c) { return c.id === b.id }).count).toBe(0)
    })

    it('listTreeWithStats：一级的 total = 自己 + 所有子级（删父级前的提示口径）', async () => {
      const food = expenseTops.find(function (c) { return c.name === '餐饮' })
      const [a, b] = kids(all, food.id)
      await txService.addTx({ amountStr: '10', categoryId: a.id, type: 'expense', ts: Date.now() })
      await txService.addTx({ amountStr: '20', categoryId: b.id, type: 'expense', ts: Date.now() })
      await txService.addTx({ amountStr: '30', categoryId: food.id, type: 'expense', ts: Date.now() })
      const tree = await categoryService.listTreeWithStats('expense')
      const node = tree.find(function (n) { return n.cat.id === food.id })
      expect(node.cat.count).toBe(1)
      expect(node.cat.total).toBe(3)
    })

    it('listTreeWithStats 只返回一级作为节点，二级挂在 children 里', async () => {
      const tree = await categoryService.listTreeWithStats('expense')
      expect(tree.length).toBe(expenseTops.length)
      expect(tree.every(function (n) { return n.cat.parent_id == null })).toBe(true)
    })
  })

  describe('可选图标清单（T3.4 按类型过滤）', () => {
    it('不传类型时返回全部（兼容旧调用方）', () => {
      const n = categoryService.iconOptions().length
      expect(n).toBe(26)
      expect(categoryService.iconOptions(null).length).toBe(n)
      expect(categoryService.iconOptions('xxx').length).toBe(n)
    })

    it('支出：含「其他」与一级分类专用图标，不含工资/红包(收入)等收入语义图标', () => {
      const keys = categoryService.iconOptions('expense')
      expect(keys).toContain('more')
      expect(keys).toContain('breakfast')
      expect(keys).toContain('food')
      expect(keys).toContain('travel')
      expect(keys).not.toContain('salary')
      expect(keys).not.toContain('redbag')
      expect(keys.length).toBe(19)
    })

    it('收入：含「其他」，不含奶茶/打车等支出语义图标', () => {
      const keys = categoryService.iconOptions('income')
      expect(keys).toContain('more')
      expect(keys).toContain('salary')
      expect(keys).not.toContain('milktea')
      expect(keys).not.toContain('taxi')
      expect(keys.length).toBe(8)
    })

    it('每个内置分类的图标都能在自己的类型清单里找到（过滤器不自相矛盾）', async () => {
      const rows = await categoryService.listAll()
      rows.forEach(function (c) {
        expect(categoryService.iconOptions(c.type), c.name).toContain(c.icon)
      })
    })
  })
})

describe('老库迁移到两级（v7）—— 历史数据零影响', () => {
  /** 复刻用户手机上真实的老库：一级平铺 20 个 + 两笔流水 */
  const LEGACY = [
    { name: '早餐', icon: 'breakfast', type: 'expense', sort: 1 },
    { name: '午餐', icon: 'lunch', type: 'expense', sort: 2 },
    { name: '零食', icon: 'snack', type: 'expense', sort: 3 },
    { name: '奶茶', icon: 'milktea', type: 'expense', sort: 4 },
    { name: '公交', icon: 'bus', type: 'expense', sort: 5 },
    { name: '打车', icon: 'taxi', type: 'expense', sort: 6 },
    { name: '购物', icon: 'shop', type: 'expense', sort: 7 },
    { name: '住房', icon: 'home', type: 'expense', sort: 8 },
    { name: '娱乐', icon: 'fun', type: 'expense', sort: 9 },
    { name: '医疗', icon: 'med', type: 'expense', sort: 10 },
    { name: '红包', icon: 'gift', type: 'expense', sort: 11 },
    { name: '其他', icon: 'more', type: 'expense', sort: 12 },
    { name: '工资', icon: 'salary', type: 'income', sort: 1 },
    { name: '奖金', icon: 'bonus', type: 'income', sort: 2 },
    { name: '兼职', icon: 'part', type: 'income', sort: 3 },
    { name: '理财', icon: 'invest', type: 'income', sort: 4 },
    { name: '红包', icon: 'redbag', type: 'income', sort: 5 },
    { name: '报销', icon: 'reimb', type: 'income', sort: 6 },
    { name: '二手', icon: 'sell', type: 'income', sort: 7 },
    { name: '其他', icon: 'more', type: 'income', sort: 8 }
  ]

  /** 造一个老库：平铺分类 + 两笔真实流水（早餐 ¥54.20 / 打车 ¥33.00） */
  async function makeLegacyDb() {
    resetStorageForTest()
    const s = getStorage()
    await s.init()
    for (const c of LEGACY) await s.categoryInsert(c)
    const cats = await s.categoryList()
    const breakfast = cats.find(function (c) { return c.name === '早餐' && c.type === 'expense' })
    const taxi = cats.find(function (c) { return c.name === '打车' && c.type === 'expense' })
    await txService.addTx({ amountStr: '54.20', categoryId: breakfast.id, type: 'expense', ts: Date.now() })
    await txService.addTx({ amountStr: '33.00', categoryId: taxi.id, type: 'expense', ts: Date.now() })
    return { breakfast, taxi }
  }

  it('老库（平铺）会被识别为需要迁移', async () => {
    await makeLegacyDb()
    expect(await categoryService.migrateCategoryTree()).toBe(true)
  })

  it('迁移后：老叶子挂到新一级下，一级变成 parent_id=null', async () => {
    await makeLegacyDb()
    await categoryService.migrateCategoryTree()
    const all = await categoryService.listAll()
    const name = function (n) { return all.find(function (c) { return c.name === n && c.type === 'expense' }) }
    const idOf = function (n) { return name(n).id }

    expect(name('餐饮').parent_id).toBe(null)
    expect(name('交通').parent_id).toBe(null)
    expect(name('人情').parent_id).toBe(null)
    expect(name('早餐').parent_id).toBe(idOf('餐饮'))
    expect(name('午餐').parent_id).toBe(idOf('餐饮'))
    expect(name('奶茶').parent_id).toBe(idOf('餐饮'))
    expect(name('公交').parent_id).toBe(idOf('交通'))
    expect(name('打车').parent_id).toBe(idOf('交通'))
    expect(name('红包').parent_id).toBe(idOf('人情'))
  })

  it('老库里的「住房」被**改名**成「居住」，不是新插一行留下孤儿', async () => {
    await makeLegacyDb()
    await categoryService.migrateCategoryTree()
    const all = await categoryService.listAll()
    const expense = all.filter(function (c) { return c.type === 'expense' })
    expect(expense.some(function (c) { return c.name === '住房' })).toBe(false)
    const live = expense.find(function (c) { return c.name === '居住' })
    expect(live.icon).toBe('home') // icon key 保留，配色不变
  })

  it('老库里已有流水的分类（购物/娱乐/医疗）就地升级成一级', async () => {
    await makeLegacyDb()
    await categoryService.migrateCategoryTree()
    const all = await categoryService.listAll()
    const shop = all.find(function (c) { return c.name === '购物' && c.type === 'expense' })
    expect(shop.parent_id).toBe(null)
    expect(categoryService.childrenOf(all, shop.id).length).toBeGreaterThan(0)
  })

  it('⭐ 迁移**一个字节都不动 transaction_record**（笔数、金额、分类指向全不变）', async () => {
    const { breakfast, taxi } = await makeLegacyDb()
    const before = await txService.listByMonth(ymOf(Date.now()), 1)
    const snap = JSON.stringify(before)

    await categoryService.migrateCategoryTree()

    const after = await txService.listByMonth(ymOf(Date.now()), 1)
    expect(JSON.stringify(after)).toBe(snap)
    // 而且流水仍然指着原来那两个分类 id
    const ids = after.map(function (r) { return r.category_id }).sort()
    expect(ids).toEqual([breakfast.id, taxi.id].sort())
  })

  it('迁移后统计口径不变：餐饮下的支出合计 = 迁移前的早餐金额', async () => {
    const { breakfast } = await makeLegacyDb()
    const before = await txService.listByMonth(ymOf(Date.now()), 1)
    const sum = function (rows) { return rows.reduce(function (s, r) { return s + r.amount_cents }, 0) }

    await categoryService.migrateCategoryTree()

    const after = await txService.listByMonth(ymOf(Date.now()), 1)
    expect(sum(after)).toBe(sum(before))
    // 早餐仍是那 54.20 的落点分类（id 没变）
    expect(after.some(function (r) { return r.category_id === breakfast.id && r.amount_cents === 5420 })).toBe(true)
  })

  it('迁移是幂等的：跑第二次返回 false，分类集合与排序都不再变', async () => {
    await makeLegacyDb()
    expect(await categoryService.migrateCategoryTree()).toBe(true)
    const snap = JSON.stringify(await categoryService.listAll())
    expect(await categoryService.migrateCategoryTree()).toBe(false)
    expect(JSON.stringify(await categoryService.listAll())).toBe(snap)
  })

  it('迁移后顺序规范：一级按事实源顺序、组内二级按事实源顺序', async () => {
    await makeLegacyDb()
    await categoryService.migrateCategoryTree()
    const all = await categoryService.listAll()
    expect(categoryService.topLevelOf(all, 'expense').map(function (c) { return c.name }))
      .toEqual(S.EXPENSE_TREE.map(function (p) { return p.name }))
    const food = all.find(function (c) { return c.name === '餐饮' && c.type === 'expense' })
    expect(categoryService.childrenOf(all, food.id).map(function (c) { return c.name }))
      .toEqual(S.EXPENSE_TREE[0].children.map(function (c) { return c.name }))
  })

  it('用户自建的分类不会被迁移吞掉（保持存在，排在该组末尾）', async () => {
    await makeLegacyDb()
    const s = getStorage()
    await s.categoryInsert({ name: '夜宵', icon: 'snack', type: 'expense', sort: 99 })
    await categoryService.migrateCategoryTree()
    const all = await categoryService.listAll()
    const mine = all.find(function (c) { return c.name === '夜宵' })
    expect(mine).toBeTruthy()
    // 自建的一级排在事实源的一级之后，不会被夹在中间
    const names = categoryService.topLevelOf(all, 'expense').map(function (c) { return c.name })
    expect(names[names.length - 1]).toBe('夜宵')
  })

  it('空库（已经是两级）再跑迁移是 no-op', async () => {
    resetStorageForTest()
    await getStorage().init()
    await categoryService.seedIfEmpty()
    expect(await categoryService.migrateCategoryTree()).toBe(false)
  })
})

describe('treeSortPlan —— 规范排序（纯函数）', () => {
  it('支出按事实源顺序编号；收入按原序 1..n', () => {
    const list = [
      { id: 10, name: '其他', type: 'expense', sort: 99, parent_id: null },
      { id: 11, name: '餐饮', type: 'expense', sort: 42, parent_id: null },
      { id: 12, name: '早餐', type: 'expense', sort: 7, parent_id: 11 },
      { id: 13, name: '工资', type: 'income', sort: 5, parent_id: null },
      { id: 14, name: '奖金', type: 'income', sort: 1, parent_id: null }
    ]
    const plan = new Map(S.treeSortPlan(list).map(function (p) { return [p.id, p.sort] }))
    expect(plan.get(11)).toBe(1) // 餐饮在事实源里排第一
    expect(plan.get(12)).toBe(1) // 早餐是餐饮的第 1 个子类
    expect(plan.get(10)).toBe(S.EXPENSE_TREE.length) // 其他在事实源末尾
    expect(plan.get(14)).toBe(1) // 奖金原 sort=1 → 收入第一位
    expect(plan.get(13)).toBe(2)
  })

  it('自建的支出一级排在事实源之后，自建的二级排在自己一级的组末', () => {
    const list = [
      { id: 1, name: '餐饮', type: 'expense', sort: 1, parent_id: null },
      { id: 2, name: '早餐', type: 'expense', sort: 1, parent_id: 1 },
      { id: 3, name: '夜宵', type: 'expense', sort: 2, parent_id: 1 },
      { id: 4, name: '健身', type: 'expense', sort: 2, parent_id: null },
      { id: 5, name: '私教', type: 'expense', sort: 1, parent_id: 4 }
    ]
    const plan = new Map(S.treeSortPlan(list).map(function (p) { return [p.id, p.sort] }))
    // 夜宵追加在餐饮组末 —— 本 fixture 里餐饮组只存在「早餐」，所以夜宵拿到 2；
    // 真实库里组内有 6 个事实源子类，夜宵会拿到 7。这里断言"排在组内已知子类之后"即可
    expect(plan.get(3)).toBeGreaterThan(plan.get(2))
    expect(plan.get(4)).toBe(S.EXPENSE_TREE.length + 1) // 健身追加在一级末
    expect(plan.get(5)).toBe(1)
  })

  it('空输入不炸', () => {
    expect(S.treeSortPlan(null)).toEqual([])
    expect(S.treeSortPlan([])).toEqual([])
  })
})
