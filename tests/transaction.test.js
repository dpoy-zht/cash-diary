/**
 * 适配器事务语义测试（T2.1）。
 *
 * sqlite 侧无法在 Node 跑（plus.sqlite 仅真机），这里验证 memory 适配器必须满足的
 * 事务契约：要么全做、要么全不做。同一契约在真机上以 sqlite 冒烟清单核对。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'

async function seedOneTx() {
  const s = getStorage()
  await s.init()
  await s.txInsert({
    account_id: 1, category_id: 1, type: 'expense', amount_cents: 1000,
    note: '原有账', occurred_at: 1700000000000, created_at: 1700000000000,
    updated_at: 1700000000000, deleted_at: null
  })
}

describe('memory 适配器事务契约（T2.1）', () => {
  beforeEach(() => {
    resetStorageForTest()
  })

  it('正常路径：fn 内的全部写入在 COMMIT 后生效', async () => {
    await seedOneTx()
    const s = getStorage()
    await s.transaction(async function () {
      await s.txInsert({
        account_id: 1, category_id: 1, type: 'income', amount_cents: 500,
        note: '事务内新增', occurred_at: 1700000001000, created_at: 1700000001000,
        updated_at: 1700000001000, deleted_at: null
      })
    })
    const rows = await s.txListByMonth(0, 9999999999999, 1)
    expect(rows.length).toBe(2)
    expect(rows.map(function (r) { return r.note }).sort()).toEqual(['事务内新增', '原有账'])
  })

  it('失败路径：fn 抛错 → ROLLBACK，库内数据与事务前完全一致，且原错误上抛', async () => {
    await seedOneTx()
    const s = getStorage()
    await expect(s.transaction(async function () {
      await s.txInsert({
        account_id: 1, category_id: 1, type: 'expense', amount_cents: 999,
        note: '半途写入', occurred_at: 1700000002000, created_at: 1700000002000,
        updated_at: 1700000002000, deleted_at: null
      })
      throw new Error('模拟中途失败')
    })).rejects.toThrow('模拟中途失败')

    const rows = await s.txListByMonth(0, 9999999999999, 1)
    expect(rows.length).toBe(1)
    expect(rows[0].note).toBe('原有账')
    expect(rows[0].amount_cents).toBe(1000)
  })

  it('恢复中途失败 → 整体回滚：库内数据与恢复前完全一致（P0 验收①）', async () => {
    await seedOneTx()
    const s = getStorage()
    const before = JSON.parse(JSON.stringify(await s.dumpAll()))

    // 构造一个"插入到一半必炸"的备份：第 2 行带 getter，读取时抛错
    const badBackup = {
      account: [{ id: 1, name: '日常账本', created_at: 1700000000000 }],
      category: [{ id: 1, name: '餐饮', type: 'expense', icon: 'canyin', sort: 0 }],
      transaction_record: [
        { id: 1, account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '好行',
          occurred_at: 1700000000000, created_at: 1700000000000, updated_at: 1700000000000, deleted_at: null },
        { get id() { throw new Error('坏行') } }
      ],
      budget: [],
      fixed_expense: []
    }
    await expect(s.restoreAll(badBackup)).rejects.toThrow('坏行')

    // 库内数据与恢复前逐字节一致（旧数据没被清掉）
    const after = await s.dumpAll()
    expect(after).toEqual(before)
  })

  it('正常恢复仍然完整：行数、原 id、自增起点都对', async () => {
    await seedOneTx()
    const s = getStorage()
    const backup = {
      account: [{ id: 1, name: '日常账本', created_at: 1700000000000 }],
      category: [{ id: 1, name: '餐饮', type: 'expense', icon: 'canyin', sort: 0 }],
      transaction_record: [
        { id: 7, account_id: 1, category_id: 1, type: 'expense', amount_cents: 2500, note: '恢复的账',
          occurred_at: 1700000000000, created_at: 1700000000000, updated_at: 1700000000000, deleted_at: null }
      ],
      budget: [],
      fixed_expense: []
    }
    await s.restoreAll(backup)
    const rows = await s.txListByMonth(0, 9999999999999, 1)
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(7)
    // 恢复后新增记录的 id 必须接在最大 id 之后，不撞车
    const newId = await s.txInsert({
      account_id: 1, category_id: 1, type: 'expense', amount_cents: 1,
      note: '恢复后新增', occurred_at: 1700000005000, created_at: 1700000005000,
      updated_at: 1700000005000, deleted_at: null
    })
    expect(newId).toBeGreaterThan(7)
  })
})
