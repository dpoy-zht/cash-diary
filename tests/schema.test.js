import { describe, it, expect } from 'vitest'
import { MIGRATIONS, SCHEMA_SQL, INDEX_SQL } from '../src/db/schema.js'

describe('MIGRATIONS —— 迁移登记表', () => {
  it('版本号严格递增且唯一（云打包升级按序补跑）', () => {
    const versions = MIGRATIONS.map(function (m) { return m.version })
    expect(versions).toEqual([1, 2, 3, 4])
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
})
