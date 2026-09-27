import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats } from '../src/services/category.js'
import * as accountService from '../src/services/account.js'
import * as budgetService from '../src/services/budget.js'
import * as txService from '../src/services/tx.js'
import * as backupService from '../src/services/backup.js'
import { resetAll } from '../src/services/maintenance.js'
import {
  buildBackup,
  validateBackup,
  backupFileName,
  BACKUP_APP,
  BACKUP_VERSION
} from '../src/utils/backup.js'
import { ymOf } from '../src/utils/date.js'
import { expenseByCategory } from '../src/utils/stats.js'

describe('buildBackup / backupFileName（纯函数）', () => {
  it('打包带上身份与版本号，缺表时补空数组', () => {
    const b = buildBackup({ account: [{ id: 1 }] }, 1730000000000)
    expect(b.app).toBe(BACKUP_APP)
    expect(b.version).toBe(BACKUP_VERSION)
    expect(b.exportedAt).toBe(1730000000000)
    expect(b.account.length).toBe(1)
    expect(b.category).toEqual([])
    expect(b.transaction_record).toEqual([])
    expect(b.budget).toEqual([])
  })

  it('文件名带日期时间戳', () => {
    const name = backupFileName(new Date(2026, 8, 27, 13, 5).getTime())
    expect(name).toBe('奶龙记账-备份-2026-09-27-1305.json')
  })
})

describe('validateBackup —— 坏文件必须被挡住', () => {
  const good = function () {
    return buildBackup({
      account: [{ id: 1, name: '日常账本', created_at: 1 }],
      category: [{ id: 1, name: '午餐', type: 'expense', icon: 'lunch', sort: 1 }],
      transaction_record: [{
        id: 1, account_id: 1, category_id: 1, type: 'expense',
        amount_cents: 1990, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null
      }],
      budget: [{ id: 1, account_id: 1, category_id: null, limit_cents: 500000, updated_at: 1 }]
    }, 1)
  }

  it('合法备份通过，并给出条数概览', () => {
    const r = validateBackup(good())
    expect(r.ok).toBe(true)
    expect(r.counts.account).toBe(1)
    expect(r.counts.transaction_record).toBe(1)
  })

  it('各种非备份文件都被拒绝', () => {
    expect(validateBackup(null).ok).toBe(false)
    expect(validateBackup('{}').ok).toBe(false)
    expect(validateBackup([]).ok).toBe(false)
    expect(validateBackup({ app: 'other-app' }).error).toContain('不是奶龙记账')
    expect(validateBackup({ app: BACKUP_APP }).error).toContain('版本号')
    expect(validateBackup({ app: BACKUP_APP, version: 1, account: [], category: [], transaction_record: [] }).error)
      .toContain('没有任何账本')
  })

  it('来自更高版本的备份不给恢复（避免把新结构塞进老库）', () => {
    const b = good()
    b.version = BACKUP_VERSION + 1
    expect(validateBackup(b).ok).toBe(false)
    expect(validateBackup(b).error).toContain('升级')
  })

  it('流水金额不是正整数分 → 整份拒绝（数据铁律 1）', () => {
    const cases = [1990.5, 0, -100, '1990', null]
    cases.forEach(function (bad) {
      const b = good()
      b.transaction_record[0].amount_cents = bad
      const r = validateBackup(b)
      expect(r.ok, 'amount=' + bad).toBe(false)
      expect(r.error).toContain('金额不合法')
    })
  })

  it('类型不是 income/expense → 整份拒绝', () => {
    const b = good()
    b.transaction_record[0].type = 'transfer'
    expect(validateBackup(b).ok).toBe(false)
  })

  it('预算金额非法 → 整份拒绝', () => {
    const b = good()
    b.budget[0].limit_cents = 0
    expect(validateBackup(b).ok).toBe(false)
  })

  it('分类数据非法 → 整份拒绝', () => {
    const b = good()
    b.category[0].type = 'unknown'
    expect(validateBackup(b).ok).toBe(false)
  })

  it('没有 budget 字段的老备份仍可恢复（向后兼容）', () => {
    const b = good()
    delete b.budget
    const r = validateBackup(b)
    expect(r.ok).toBe(true)
    expect(r.counts.budget).toBe(0)
  })
})

describe('备份往返：导出 → 清空 → 恢复', () => {
  let ym
  let cats

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    await accountService.seedDefaultIfEmpty()
    ym = ymOf(Date.now())
    cats = await listCats()
  })

  /** 造一份有代表性的数据：两个账本、收入支出、软删除记录、总预算+分类预算 */
  async function seedRichData() {
    const exp = cats.filter(function (c) { return c.type === 'expense' })[0]
    const inc = cats.filter(function (c) { return c.type === 'income' })[0]
    await txService.addTx({ amountStr: '19.9', categoryId: exp.id, type: 'expense', note: '午餐', ts: Date.now() })
    await txService.addTx({ amountStr: '8500', categoryId: inc.id, type: 'income', note: '工资', ts: Date.now() })
    await txService.addTx({ amountStr: '5', categoryId: exp.id, type: 'expense', note: '要被删掉的', ts: Date.now() })
    const all = await txService.listByMonth(ym, 1)
    await txService.removeTx(all.find(function (r) { return r.note === '要被删掉的' }).id)
    await budgetService.setTotal(1, '5000')
    await budgetService.setCategory(1, exp.id, '1200')
    await accountService.create('旅行基金')
    return { exp: exp, inc: inc }
  }

  it('导出的备份包含软删除记录（否则恢复后它们会“复活”）', async () => {
    await seedRichData()
    const b = await backupService.exportBackup()
    expect(b.transaction_record.length).toBe(3) // 2 条正常 + 1 条软删除
    expect(b.transaction_record.filter(function (r) { return r.deleted_at != null }).length).toBe(1)
  })

  it('清空后从备份恢复，四张表完全回到原样', async () => {
    await seedRichData()
    const before = {
      accounts: await accountService.listWithStats(),
      cats: await listCats(),
      txs: await txService.listByMonth(ym, 1),
      overview: await txService.overview(1),
      budget: await budgetService.getAll(1)
    }

    // 先导出，再清空（顺序不能反：清空后导出拿到的是空库）
    const json = await backupService.exportJson()

    await resetAll()
    expect((await listCats()).length).toBe(20)
    expect((await txService.listByMonth(ym, 1)).length).toBe(0)

    const counts = await backupService.restoreBackup(backupService.parseBackupText(json))

    const after = {
      accounts: await accountService.listWithStats(),
      cats: await listCats(),
      txs: await txService.listByMonth(ym, 1),
      overview: await txService.overview(1),
      budget: await budgetService.getAll(1)
    }

    expect(counts.transaction_record).toBe(3)
    expect(after.cats.length).toBe(before.cats.length)
    expect(after.accounts.length).toBe(before.accounts.length)
    expect(after.accounts[1].name).toBe('旅行基金')
    expect(after.txs.length).toBe(before.txs.length)
    expect(after.overview.expenseCents).toBe(before.overview.expenseCents)
    expect(after.overview.incomeCents).toBe(before.overview.incomeCents)
    expect(after.budget.totalCents).toBe(500000)
    // 分类预算跟着回来
    const expId = String(before.cats.filter(function (c) { return c.type === 'expense' })[0].id)
    expect(after.budget.byCategory[expId]).toBe(120000)
  })

  it('恢复后还能正常记账，且新记录 id 不与老记录冲突', async () => {
    await seedRichData()
    const json = await backupService.exportJson()
    const oldIds = (await txService.listByMonth(ym, 1)).map(function (r) { return r.id })

    await resetAll()
    await backupService.restoreBackup(backupService.parseBackupText(json))
    await txService.addTx({ amountStr: '1', categoryId: cats[0].id, type: 'expense', ts: Date.now() })

    const list = await txService.listByMonth(ym, 1)
    const newest = list.find(function (r) { return r.amount_cents === 100 })
    expect(newest).toBeTruthy()
    expect(oldIds.indexOf(newest.id)).toBe(-1)
  })

  it('校验不通过时直接报错，**一个字节都不写库**（最关键的一条）', async () => {
    await seedRichData()
    const before = await txService.overview(1)

    const broken = await backupService.exportBackup()
    broken.transaction_record[0].amount_cents = 0 // 弄坏一条

    await expect(backupService.restoreBackup(broken)).rejects.toThrow('金额不合法')

    const after = await txService.overview(1)
    expect(after.totalCount).toBe(before.totalCount)
    expect(after.expenseCents).toBe(before.expenseCents)
    expect((await backupService.exportBackup()).transaction_record.length).toBe(3)
  })

  it('不是 JSON 文本时给人话报错', () => {
    expect(function () { backupService.parseBackupText('这不是 json') }).toThrow('不是有效的 JSON')
  })

  it('空备份（没有任何账本）拒绝恢复', async () => {
    const empty = buildBackup({}, Date.now())
    await expect(backupService.restoreBackup(empty)).rejects.toThrow('没有任何账本')
  })
})

describe('老格式备份兼容（emoji 分类时代的备份文件）', () => {
  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
  })

  /**
   * 旧版种子是「餐饮/交通…」等名称 + emoji 图标；新 App 的 icon 是参考包 key。
   * 这里验证：老备份能通过校验、能恢复、恢复后记账与统计链路不崩溃（icon 走兜底渲染）。
   */
  function buildLegacyBackup() {
    const now = Date.now()
    return {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: now - 30 * 86400000,
      account: [{ id: 1, name: '默认账本', created_at: now - 60 * 86400000 }],
      category: [
        { id: 1, name: '餐饮', icon: '🍜', type: 'expense', sort: 1, created_at: now, updated_at: now, deleted_at: null },
        { id: 2, name: '交通', icon: '🚌', type: 'expense', sort: 2, created_at: now, updated_at: now, deleted_at: null },
        { id: 3, name: '工资', icon: '💰', type: 'income', sort: 1, created_at: now, updated_at: now, deleted_at: null }
      ],
      transaction_record: [
        { id: 1, account_id: 1, category_id: 1, type: 'expense', amount_cents: 2500, note: '午饭',
          occurred_at: now - 86400000, created_at: now, updated_at: now, deleted_at: null },
        { id: 2, account_id: 1, category_id: 3, type: 'income', amount_cents: 500000, note: '',
          occurred_at: now - 2 * 86400000, created_at: now, updated_at: now, deleted_at: null }
      ],
      budget: []
    }
  }

  it('老备份通过校验并成功恢复（结构兼容，emoji icon 不校验）', async () => {
    const b = buildLegacyBackup()
    const check = validateBackup(b)
    expect(check.ok).toBe(true)
    const counts = await backupService.restoreBackup(b)
    expect(counts.category).toBe(3)
    expect(counts.transaction_record).toBe(2)

    const cats = await listCats()
    expect(cats.length).toBe(3)
    expect(cats.find(function (c) { return c.name === '餐饮' }).icon).toBe('🍜')
  })

  it('恢复后的老分类能正常记账、统计与搜索（icon 兜底渲染不崩溃）', async () => {
    await backupService.restoreBackup(buildLegacyBackup())
    const cats = await listCats()
    const canyin = cats.find(function (c) { return c.name === '餐饮' })

    // 记账闭环照常
    await txService.addTx({ amountStr: '12', categoryId: canyin.id, type: 'expense', note: '面', ts: Date.now() })
    const list = await txService.listByMonth(ymOf(Date.now()))
    expect(list.length).toBe(3) // 老备份两笔都在本月 + 新记 1 笔

    // 统计纯函数对 emoji icon 分类也能取到兜底色
    const rows = expenseByCategory(list, cats)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].color).toMatch(/^#[0-9a-f]{6}$/)

    // 搜索链路照常
    const hit = await txService.search('午饭')
    expect(hit.length).toBe(1)
  })
})
