import { describe, it, expect } from 'vitest'
import { MIGRATIONS, SCHEMA_SQL, INDEX_SQL, CATEGORY_TREE_SQL } from '../src/db/schema.js'

describe('MIGRATIONS —— 迁移登记表', () => {
  it('版本号严格递增且唯一（云打包升级按序补跑）', () => {
    const versions = MIGRATIONS.map(function (m) { return m.version })
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('v4：为 (account_id, occurred_at) 建复合索引，IF NOT EXISTS 幂等', () => {
    const v4 = MIGRATIONS.find(function (m) { return m.version === 4 })
    expect(v4.name).toBe('v4_query_index')
    expect(v4.sql).toContain('idx_tx_account_time')
    expect(v4.sql).toContain('IF NOT EXISTS')
    expect(INDEX_SQL).toBe(v4.sql)
  })

  it('已发布迁移未被改动（防手滑改历史）', () => {
    expect(SCHEMA_SQL).toContain('idx_tx_time')
    expect(MIGRATIONS.find(function (m) { return m.version === 2 }).sql).toContain('account_id')
    expect(MIGRATIONS.find(function (m) { return m.version === 3 }).sql).toContain('limit_cents')
  })

  it('每条迁移都有版本号、名称和 SQL', () => {
    for (const m of MIGRATIONS) {
      expect(Number.isInteger(m.version)).toBe(true)
      expect(typeof m.name).toBe('string')
      expect(typeof m.sql).toBe('string')
      expect(m.sql.length).toBeGreaterThan(0)
    }
  })

  it('T2.6：statements 与 sql 内容一致（防两份漂移），且每条无尾分号', () => {
    const norm = function (s) { return s.replace(/;/g, ' ').replace(/\s+/g, ' ').trim() }
    for (const m of MIGRATIONS) {
      expect(Array.isArray(m.statements)).toBe(true)
      expect(m.statements.length).toBeGreaterThan(0)
      for (const st of m.statements) {
        expect(typeof st).toBe('string')
        expect(st.trim().endsWith(';')).toBe(false)
        expect(norm(m.sql)).toContain(norm(st))
      }
    }
  })
})

describe('v5 —— 固定支出表', () => {
  it('v5：fixed_expense 表 + 记账日 CHECK(1~28) + 账本索引', () => {
    const v5 = MIGRATIONS.find(function (m) { return m.version === 5 })
    expect(v5.name).toBe('v5_fixed_expense')
    expect(v5.sql).toContain('CREATE TABLE IF NOT EXISTS fixed_expense')
    expect(v5.sql).toContain("day_of_month   INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 28)")
    expect(v5.sql).toContain('idx_fixed_acc')
  })

  it('last_posted_ym 默认空串（从没记过 → 首次必补记）', () => {
    const v5 = MIGRATIONS.find(function (m) { return m.version === 5 })
    expect(v5.sql).toContain("last_posted_ym TEXT    NOT NULL DEFAULT ''")
  })
})

describe('v7 —— 两级分类', () => {
  it('v7：给 category 加 parent_id 列并建索引（加列不重建表，历史行自动为 NULL）', () => {
    const v7 = MIGRATIONS.find(function (m) { return m.version === 7 })
    expect(v7.name).toBe('v7_category_parent')
    expect(v7.sql).toBe(CATEGORY_TREE_SQL)
    expect(v7.sql).toContain('ALTER TABLE category ADD COLUMN parent_id INTEGER')
    expect(v7.sql).toContain('idx_category_parent')
    // 必须是 ADD COLUMN（纯增量），**不能**是重建表 —— 重建会丢历史流水
    expect(v7.sql).not.toContain('DROP TABLE')
    expect(v7.sql).not.toContain('CREATE TABLE category')
  })

  it('v7 不触碰 transaction_record（老数据零影响）', () => {
    const v7 = MIGRATIONS.find(function (m) { return m.version === 7 })
    expect(v7.sql).not.toContain('transaction_record')
  })
})
