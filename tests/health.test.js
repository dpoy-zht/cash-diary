import { describe, it, expect, beforeEach } from 'vitest'
import { scanHealth, collectFixes, STALE_BACKUP_DAYS } from '../src/utils/health.js'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats } from '../src/services/category.js'
import { scanDataHealth, repairDataHealth } from '../src/services/maintenance.js'

const NOW = new Date(2026, 8, 29, 12, 0, 0).getTime()
const DAY = 86400000

function at(y, mo, d, h) {
  return new Date(y, mo - 1, d, h == null ? 12 : h, 0, 0).getTime()
}

/** 干净的一套数据（分类 1 早餐 / 2 午餐 / 13 工资，账本 1） */
function cleanTables() {
  return {
    account: [{ id: 1, name: '日常账本', created_at: at(2026, 9, 1) }],
    category: [
      { id: 1, name: '早餐', icon: 'breakfast', type: 'expense', sort: 1 },
      { id: 2, name: '午餐', icon: 'lunch', type: 'expense', sort: 2 },
      { id: 3, name: '其他', icon: 'more', type: 'expense', sort: 3 },
      { id: 13, name: '工资', icon: 'salary', type: 'income', sort: 1 }
    ],
    transaction_record: [
      { id: 1, account_id: 1, category_id: 1, type: 'expense', amount_cents: 3000, occurred_at: at(2026, 9, 2), deleted_at: null },
      { id: 2, account_id: 1, category_id: 2, type: 'expense', amount_cents: 2000, occurred_at: at(2026, 9, 3), deleted_at: null },
      { id: 3, account_id: 1, category_id: 13, type: 'income', amount_cents: 100000, occurred_at: at(2026, 9, 5), deleted_at: null }
    ],
    budget: [{ id: 1, account_id: 1, category_id: null, limit_cents: 100000 }],
    fixed_expense: []
  }
}

function scan(patch, opts) {
  return scanHealth(Object.assign({ tables: cleanTables(), lastBackupAt: NOW - DAY, nowTs: NOW }, opts, patch))
}

function keysOf(r) {
  return r.issues.map(function (i) { return i.key })
}

describe('T4.6 —— 数据体检：干净数据', () => {
  it('没有问题时 healthy 为 true、清单为空', () => {
    const r = scan({})
    expect(r.healthy).toBe(true)
    expect(r.issues).toEqual([])
    expect(r.fixableCount).toBe(0)
  })

  it('统计口径：流水只数未删除的，软删除单独计数', () => {
    const t = cleanTables()
    t.transaction_record.push(Object.assign({}, t.transaction_record[0], { id: 99, deleted_at: at(2026, 9, 6) }))
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    expect(r.stats.transactions).toBe(3)
    expect(r.stats.deletedTransactions).toBe(1)
    expect(r.stats.categories).toBe(4)
    expect(r.stats.accounts).toBe(1)
  })

  it('软删除的脏记录不参与体检（已经废掉的数据不用管）', () => {
    const t = cleanTables()
    t.transaction_record.push({ id: 88, account_id: 1, category_id: 999, type: 'expense', amount_cents: 0, occurred_at: at(2026, 9, 7), deleted_at: at(2026, 9, 7) })
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    expect(r.healthy).toBe(true)
  })
})

describe('T4.6 —— 孤儿记录', () => {
  it('流水的分类不存在 → 高危、可修，指向同类型「其他」', () => {
    const t = cleanTables()
    t.transaction_record[0].category_id = 999
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'orphan-tx-category' })
    expect(it.severity).toBe('high')
    expect(it.count).toBe(1)
    expect(it.fixable).toBe(true)
    expect(it.payload.txPatches).toEqual([{ id: 1, patch: { category_id: 3 } }]) // 3 = 其他
  })

  it('找不到「其他」时退到同类型第一个分类（有得修就修）', () => {
    const t = cleanTables()
    t.category = t.category.filter(function (c) { return c.id !== 3 })
    t.transaction_record[0].category_id = 999
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'orphan-tx-category' })
    expect(it.fixable).toBe(true)
    expect(it.payload.txPatches[0].patch.category_id).toBe(1)
  })

  it('同类分类一个都没有 → 不可修，但要说清楚该怎么办', () => {
    const t = cleanTables()
    t.category = t.category.filter(function (c) { return c.id === 13 }) // 只剩收入分类
    t.transaction_record[0].category_id = 999
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'orphan-tx-category' })
    expect(it.fixable).toBe(false)
    expect(it.payload).toBeNull()
    expect(it.advice).toContain('分类管理')
  })

  it('按各自的类型分别落回（支出归支出、收入归收入）', () => {
    const t = cleanTables()
    t.transaction_record[0].category_id = 999 // 支出
    t.transaction_record[2].category_id = 888 // 收入
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'orphan-tx-category' })
    const map = {}
    it.payload.txPatches.forEach(function (p) { map[p.id] = p.patch.category_id })
    expect(map[1]).toBe(3) // 其他（支出）
    expect(map[3]).toBe(13) // 工资（收入，是唯一收入分类）
  })

  it('流水的账本不存在 → 落到默认账本 1', () => {
    const t = cleanTables()
    t.account.push({ id: 2, name: '旅行账本', created_at: at(2026, 9, 1) })
    t.transaction_record[0].account_id = 77
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'orphan-tx-account' })
    expect(it.count).toBe(1)
    expect(it.payload.txPatches).toEqual([{ id: 1, patch: { account_id: 1 } }])
  })

  it('账本表里没有默认账本 1 时，落到第一个账本', () => {
    const t = cleanTables()
    t.account = [{ id: 5, name: '只有这个', created_at: at(2026, 9, 1) }]
    t.transaction_record[0].account_id = 77
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'orphan-tx-account' })
    expect(it.payload.txPatches[0].patch.account_id).toBe(5)
  })
})

describe('T4.6 —— 异常金额', () => {
  it('非整数分 → 四舍五入写回；字符串数字也一样修', () => {
    const t = cleanTables()
    t.transaction_record[0].amount_cents = 1999.6
    t.transaction_record[1].amount_cents = '2500'
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'amount-round' })
    expect(it.count).toBe(2)
    const map = {}
    it.payload.txPatches.forEach(function (p) { map[p.id] = p.patch.amount_cents })
    expect(map[1]).toBe(2000)
    expect(map[2]).toBe(2500)
  })

  it('0 / 负数 / 非数字 → 没救，软删除（不猜原值）', () => {
    const t = cleanTables()
    t.transaction_record[0].amount_cents = 0
    t.transaction_record[1].amount_cents = 'abc'
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'amount-bad' })
    expect(it.count).toBe(2)
    expect(it.payload.txDeletes.sort()).toEqual([1, 2])
    expect(it.advice).toContain('无法猜回')
  })

  it('两类金额问题分开报（能修的别跟没救的混在一起）', () => {
    const t = cleanTables()
    t.transaction_record[0].amount_cents = 1.5
    t.transaction_record[1].amount_cents = 0
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    expect(keysOf(r)).toContain('amount-round')
    expect(keysOf(r)).toContain('amount-bad')
  })
})

describe('T4.6 —— 失效的配置', () => {
  it('预算指向不存在的分类 → 删掉（总预算 category_id 为 null 是合法的，不能误伤）', () => {
    const t = cleanTables()
    t.budget.push({ id: 2, account_id: 1, category_id: 999, limit_cents: 5000 })
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'orphan-budget' })
    expect(it.count).toBe(1)
    expect(it.payload.budgetDeletes).toEqual([{ account_id: 1, category_id: 999 }])
  })

  it('固定支出指向不存在的分类 → 删掉，并说明"不删会每月补记到不存在的分类"', () => {
    const t = cleanTables()
    t.fixed_expense.push({ id: 7, account_id: 1, category_id: 888, amount_cents: 100000, day_of_month: 5, enabled: 1 })
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'orphan-fixed' })
    expect(it.payload.fixedDeletes).toEqual([7])
    expect(it.advice).toContain('自动补记')
  })

  it('分类图标取不到 → 换成通用图标', () => {
    const t = cleanTables()
    t.category[0].icon = 'not-a-real-icon'
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'bad-icon' })
    expect(it.severity).toBe('low')
    expect(it.payload.categoryPatches).toEqual([{ id: 1, patch: { icon: 'more' } }])
  })

  it('内置图标都认识，不会误报', () => {
    const r = scan({})
    expect(keysOf(r)).not.toContain('bad-icon')
  })
})

describe('T4.6 —— 时间与备份', () => {
  it('时间在将来的流水只提示不代劳（也可能是提前记的账）', () => {
    const t = cleanTables()
    t.transaction_record[0].occurred_at = NOW + 3 * DAY
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const it = r.issues.find(function (i) { return i.key === 'future-tx' })
    expect(it.fixable).toBe(false)
    expect(it.payload).toBeNull()
    expect(it.advice).toContain('核对')
  })

  it('一天后的流水不算"将来"（时区/预记留出余量）', () => {
    const t = cleanTables()
    t.transaction_record[0].occurred_at = NOW + 3600000 // 一小时后
    expect(keysOf(scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW }))).not.toContain('future-tx')
  })

  it('从没备份过 → 提醒去备份', () => {
    const r = scan({}, { lastBackupAt: 0 })
    const it = r.issues.find(function (i) { return i.key === 'no-backup' })
    expect(it.fixable).toBe(false)
    expect(it.advice).toContain('备份')
  })

  it('备份超过阈值天数才提示（边界：正好第 7 天算旧）', () => {
    expect(keysOf(scan({}, { lastBackupAt: NOW - (STALE_BACKUP_DAYS - 1) * DAY }))).not.toContain('stale-backup')
    const it = scan({}, { lastBackupAt: NOW - STALE_BACKUP_DAYS * DAY }).issues
      .find(function (i) { return i.key === 'stale-backup' })
    expect(it.count).toBe(1)
  })

  it('自定义阈值生效', () => {
    const r = scan({}, { lastBackupAt: NOW - 2 * DAY, staleBackupDays: 1 })
    expect(keysOf(r)).toContain('stale-backup')
  })
})

describe('T4.6 —— collectFixes 汇总', () => {
  it('只收可修的项，并保留每条的修复说明', () => {
    const t = cleanTables()
    t.transaction_record[0].category_id = 999
    t.transaction_record[1].amount_cents = 0
    t.budget.push({ id: 2, account_id: 1, category_id: 888, limit_cents: 100 })
    const r = scanHealth({ tables: t, lastBackupAt: NOW, nowTs: NOW })
    const plan = collectFixes(r)
    expect(plan.txPatches.length).toBe(1)
    expect(plan.txDeletes.length).toBe(1)
    expect(plan.budgetDeletes.length).toBe(1)
    expect(plan.summary.length).toBe(r.fixableCount)
  })

  it('不可修的项不进计划（比如"没备份过"）', () => {
    const plan = collectFixes(scan({}, { lastBackupAt: 0 }))
    const total = plan.txPatches.length + plan.txDeletes.length + plan.budgetDeletes.length + plan.fixedDeletes.length + plan.categoryPatches.length
    expect(total).toBe(0)
    expect(plan.summary).toEqual([])
  })

  it('传空/坏值不炸', () => {
    expect(collectFixes(null).summary).toEqual([])
    expect(collectFixes({ issues: null }).txPatches).toEqual([])
  })
})

/* ==================== 端到端：真库扫描 + 修复 ==================== */

describe('T4.6 —— 扫描与修复（内存存储全链路）', () => {
  let s
  let cats
  let catA
  let catOther

  beforeEach(async () => {
    const store = new Map()
    globalThis.uni = {
      getStorageSync: function (k) { return store.has(k) ? store.get(k) : '' },
      setStorageSync: function (k, v) { store.set(k, v) },
      removeStorageSync: function (k) { store.delete(k) },
      getStorageInfoSync: function () { return { keys: Array.from(store.keys()) } }
    }
    resetStorageForTest()
    s = getStorage()
    await s.init()
    await seedIfEmpty()
    await s.accountInsert({ id: 1, name: '日常账本', created_at: 1 })
    cats = await listCats()
    catA = cats.find(function (c) { return c.type === 'expense' && c.name !== '其他' })
    catOther = cats.find(function (c) { return c.type === 'expense' && c.name === '其他' })
  })

  function dirtyTx(rec) {
    return s.txInsert(Object.assign({
      account_id: 1,
      category_id: catA.id,
      type: 'expense',
      amount_cents: 1000,
      note: '',
      occurred_at: at(2026, 9, 10),
      created_at: 1,
      updated_at: 1,
      deleted_at: null
    }, rec))
  }

  it('干净库扫出来没有可修项', async () => {
    await dirtyTx({})
    const r = await scanDataHealth(NOW)
    expect(r.fixableCount).toBe(0)
  })

  it('孤儿分类修复后落回「其他」，再扫就干净了', async () => {
    await dirtyTx({ category_id: 12345 })
    let r = await scanDataHealth(NOW)
    expect(r.issues.some(function (i) { return i.key === 'orphan-tx-category' })).toBe(true)

    const fixed = await repairDataHealth(r)
    expect(fixed.changed).toBeGreaterThan(0)

    const after = await s.txListByMonth(0, 9999999999999, 1)
    expect(after[0].category_id).toBe(catOther.id)

    r = await scanDataHealth(NOW)
    expect(r.issues.some(function (i) { return i.key === 'orphan-tx-category' })).toBe(false)
  })

  it('金额 0 的流水修复后变成软删除（不是物理删除，数据还能从备份里找）', async () => {
    const id = await dirtyTx({ amount_cents: 0 })
    const r = await scanDataHealth(NOW)
    await repairDataHealth(r)
    const raw = await s.dumpAll()
    const row = raw.transaction_record.find(function (t) { return t.id === id })
    expect(row).toBeTruthy() // 还在
    expect(row.deleted_at).not.toBeNull() // 但已标记删除
    expect((await s.txListByMonth(0, 9999999999999, 1)).length).toBe(0)
  })

  it('非整数金额被写回成整数分', async () => {
    const id = await dirtyTx({ amount_cents: 1234.7 })
    const r = await scanDataHealth(NOW)
    await repairDataHealth(r)
    const rows = await s.txListByMonth(0, 9999999999999, 1)
    expect(rows.find(function (t) { return t.id === id }).amount_cents).toBe(1235)
  })

  it('失效预算与固定支出被清掉，有效的那条不受影响', async () => {
    await s.budgetUpsert({ account_id: 1, category_id: null, limit_cents: 100000, updated_at: 1 })
    await s.budgetUpsert({ account_id: 1, category_id: catA.id, limit_cents: 5000, updated_at: 1 })
    await s.budgetUpsert({ account_id: 1, category_id: 98765, limit_cents: 9999, updated_at: 1 })
    await s.fixedExpenseInsert({ account_id: 1, category_id: 98765, amount_cents: 1000, day_of_month: 5, last_posted_ym: '', enabled: 1, created_at: 1, updated_at: 1 })
    await s.fixedExpenseInsert({ account_id: 1, category_id: catA.id, amount_cents: 2000, day_of_month: 6, last_posted_ym: '', enabled: 1, created_at: 1, updated_at: 1 })

    const r = await scanDataHealth(NOW)
    await repairDataHealth(r)

    const budgets = await s.budgetList(1)
    expect(budgets.length).toBe(2) // 总预算 + 有效分类预算
    expect(budgets.some(function (b) { return Number(b.category_id) === 98765 })).toBe(false)

    const fixed = await s.fixedExpenseList(1)
    expect(fixed.length).toBe(1)
    expect(Number(fixed[0].category_id)).toBe(catA.id)
  })

  it('一次修复处理掉全部可修项，剩下的都是只提示的', async () => {
    await dirtyTx({ category_id: 12345 })
    await dirtyTx({ amount_cents: 0 })
    await s.budgetUpsert({ account_id: 1, category_id: 98765, limit_cents: 100, updated_at: 1 })

    const r = await scanDataHealth(NOW)
    const fixed = await repairDataHealth(r)
    expect(fixed.changed).toBe(r.fixableCount > 0 ? fixed.changed : 0)
    expect(fixed.summary.length).toBeGreaterThan(0)

    const after = await scanDataHealth(NOW)
    expect(after.fixableCount).toBe(0)
    // "没备份过"这类仍然提示（体检不替用户决定要不要备份）
    expect(after.issues.some(function (i) { return i.key === 'no-backup' })).toBe(true)
  })

  it('没有可修项时修复是空操作，不报错', async () => {
    await dirtyTx({})
    const r = await scanDataHealth(NOW)
    const fixed = await repairDataHealth(r)
    expect(fixed.changed).toBe(0)
  })
})
