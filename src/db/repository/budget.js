/**
 * 预算仓储：唯一持有 budget 表存储语义的地方。
 */
import { getStorage } from '../index.js'

function normalize(row) {
  return {
    id: Number(row.id),
    account_id: Number(row.account_id),
    // category_id 为 null 表示"总预算"
    category_id: row.category_id == null ? null : Number(row.category_id),
    limit_cents: Number(row.limit_cents),
    updated_at: Number(row.updated_at)
  }
}

export async function listByAccount(accountId) {
  const rows = await getStorage().budgetList(accountId)
  return rows.map(normalize)
}

export async function upsert(accountId, categoryId, limitCents) {
  return getStorage().budgetUpsert({
    account_id: accountId,
    category_id: categoryId,
    limit_cents: limitCents,
    updated_at: Date.now()
  })
}

export async function remove(accountId, categoryId) {
  return getStorage().budgetRemove(accountId, categoryId)
}
