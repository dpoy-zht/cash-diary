/**
 * 双适配器契约测试（T2.4）。
 *
 * sqlite 与 memory 必须满足同一组行为契约，这里对 memory（Node 可跑）全链路断言；
 * sqlite 侧的对应行为（last_insert_rowid 返回 id、txUpdate 维护 updated_at、
 * budgetList 排序、aid 兜底）在真机按下方清单核对——契约条目一一对应，勿删注释。
 *
 * 【真机核对清单 · sqlite 侧】
 * 1. txInsert 返回新 id（同连接 last_insert_rowid）
 * 2. txUpdate 未显式传 updated_at 时自动刷新
 * 3. budgetList：总预算（category_id IS NULL）排最前，其余按 id 升序
 * 4. fixedExpenseInsert：非法/缺省 account_id 落默认账本 1，返回新 id
 * 5. 新建账本后立即拿到正确 id（stores/account.js 不再扫描"最大 id"兜底）
 * 6. txSearch 五参签名（noteKw, kwIds, accountId, limit, filters）：关键词组内 OR、与筛选组 AND；
 *    无条件返回空数组；金额闭区间、日期左闭右开（T4.3）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'

describe('适配器契约 —— memory 侧（T2.4）', () => {
  let s

  beforeEach(async () => {
    resetStorageForTest()
    s = getStorage()
    await s.init()
  })

  it('契约1：txInsert 返回新 id，且自增连续不撞车', async () => {
    const id1 = await s.txInsert({ category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null })
    const id2 = await s.txInsert({ category_id: 1, type: 'expense', amount_cents: 200, note: '', occurred_at: 2, created_at: 2, updated_at: 2, deleted_at: null })
    expect(id1).toBeGreaterThan(0)
    expect(id2).toBe(id1 + 1)
  })

  it('契约2：txUpdate 未传 updated_at 时适配器自动维护；显式传入则以传入为准', async () => {
    const id = await s.txInsert({ category_id: 1, type: 'expense', amount_cents: 100, note: 'a', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null })
    await s.txUpdate(id, { note: 'b' })
    let rows = await s.txListByMonth(0, 9999999999999, 1)
    expect(rows[0].note).toBe('b')
    expect(rows[0].updated_at).toBeGreaterThan(1)

    await s.txUpdate(id, { note: 'c', updated_at: 555 })
    rows = await s.txListByMonth(0, 9999999999999, 1)
    expect(rows[0].updated_at).toBe(555)
  })

  it('契约3：budgetList 总预算（category_id null）排最前，其余按 id 升序', async () => {
    const a = await s.accountInsert({ id: 1, name: '日常账本', created_at: 1 })
    void a
    const c1 = await s.budgetUpsert({ account_id: 1, category_id: 3, limit_cents: 300, updated_at: 1 })
    const total = await s.budgetUpsert({ account_id: 1, category_id: null, limit_cents: 1000, updated_at: 1 })
    const c2 = await s.budgetUpsert({ account_id: 1, category_id: 2, limit_cents: 200, updated_at: 1 })
    const list = await s.budgetList(1)
    expect(list.map(function (b) { return b.id })).toEqual([total, c1, c2])
  })

  it('契约4：fixedExpenseInsert 非法/缺省 account_id 落默认账本，且返回新 id', async () => {
    const rec = { category_id: 1, amount_cents: 100, note: '', day_of_month: 5, last_posted_ym: '', enabled: 1, created_at: 1, updated_at: 1 }
    const id1 = await s.fixedExpenseInsert(Object.assign({ account_id: -5 }, rec))
    const id2 = await s.fixedExpenseInsert(Object.assign({}, rec)) // 缺省
    const list = await s.fixedExpenseList(1)
    expect(list.length).toBe(2)
    list.forEach(function (r) { expect(r.account_id).toBe(1) })
    expect(id2).toBe(id1 + 1)
  })

  it('契约5：txInsert 的非法 account_id 写入时即兜底为默认账本（读取侧不依赖二次修正）', async () => {
    await s.txInsert({ account_id: -9, category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null })
    const raw = await s.dumpAll()
    expect(Number(raw.transaction_record[0].account_id)).toBe(1)
  })

  it('契约6：txSearch 五参签名——关键词组(OR) 与 筛选组(AND) 的组合语义', async () => {
    await s.accountInsert({ id: 1, name: '日常账本', created_at: 1 })
    const base = { account_id: 1, created_at: 1, updated_at: 1, deleted_at: null }
    await s.txInsert(Object.assign({}, base, { category_id: 1, type: 'expense', amount_cents: 3000, note: '早饭', occurred_at: 10 }))
    await s.txInsert(Object.assign({}, base, { category_id: 2, type: 'expense', amount_cents: 30000, note: '打车', occurred_at: 20 }))
    await s.txInsert(Object.assign({}, base, { category_id: 3, type: 'income', amount_cents: 1200000, note: '九月工资', occurred_at: 30 }))

    // 只给筛选、不给关键词也能查（本轮新增能力）
    expect((await s.txSearch('', [], 1, 100, { type: 'expense' })).length).toBe(2)
    // 关键词组内是 OR：备注命中(早饭) 或 分类命中(id=2 → 打车)
    const orRows = await s.txSearch('早', [2], 1, 100, {})
    expect(orRows.map(function (r) { return r.note }).sort()).toEqual(['打车', '早饭'])
    // 两组之间是 AND：命中的两条都是支出，加"收入"条件后归零
    expect((await s.txSearch('早', [2], 1, 100, { type: 'income' })).length).toBe(0)
    // 金额闭区间（上下界都含）
    expect((await s.txSearch('', [], 1, 100, { minCents: 3000, maxCents: 30000 })).length).toBe(2)
    // 日期左闭右开 [10, 30)
    expect((await s.txSearch('', [], 1, 100, { startTs: 10, endTs: 30 })).length).toBe(2)
    // 一组条件都没有 → 空数组（不是全表）
    expect(await s.txSearch('', [], 1, 100, {})).toEqual([])
    // 备注匹配不区分大小写（对齐 SQLite LIKE 的 ASCII 行为）
    await s.txInsert(Object.assign({}, base, { category_id: 1, type: 'expense', amount_cents: 100, note: 'KFC', occurred_at: 40 }))
    expect((await s.txSearch('kfc', [], 1, 100, {})).length).toBe(1)
  })
})
