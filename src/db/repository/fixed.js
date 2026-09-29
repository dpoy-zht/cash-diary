/**
 * 固定支出仓储（每月自动补记的配置，v5 新表）。
 * 与其他仓储同一规矩：方法签名在 sqlite / memory 两适配器间严格一致。
 */
import { getStorage } from '../index.js'
import { aid } from '../../utils/constant.js'

function normalizeFixed(row) {
  return {
    id: Number(row.id),
    account_id: aid(Number(row.account_id)),
    category_id: Number(row.category_id),
    amount_cents: Number(row.amount_cents),
    note: row.note || '',
    day_of_month: Number(row.day_of_month),
    last_posted_ym: row.last_posted_ym || '',
    enabled: Number(row.enabled) === 1,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at)
  }
}

/** 当前账本的固定支出配置（启用在前，同组内按记账日升序） */
export async function list(accountId) {
  const rows = await getStorage().fixedExpenseList(aid(accountId))
  return rows.map(normalizeFixed)
}

export async function insert(rec, accountId) {
  return getStorage().fixedExpenseInsert(Object.assign({ account_id: aid(accountId) }, rec))
}

export async function update(id, patch) {
  return getStorage().fixedExpenseUpdate(Number(id), patch)
}

export async function remove(id) {
  return getStorage().fixedExpenseRemove(Number(id))
}
