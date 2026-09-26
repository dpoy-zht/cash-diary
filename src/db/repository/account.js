/**
 * 账本仓储：唯一持有 account 表存储语义的地方。
 */
import { getStorage } from '../index.js'

function normalizeAccount(row) {
  return {
    id: Number(row.id),
    name: row.name || '',
    created_at: Number(row.created_at)
  }
}

export async function listAll() {
  const rows = await getStorage().accountList()
  return rows.map(normalizeAccount)
}

export async function count() {
  return getStorage().accountCount()
}

export async function insert(account) {
  return getStorage().accountInsert(account)
}

export async function rename(id, name) {
  return getStorage().accountRename(id, name)
}

export async function remove(id) {
  return getStorage().accountRemove(id)
}

/**
 * 各账本聚合：笔数、累计收支、最近一笔时间。
 * 返回 Map（account_id → 统计），供列表合并展示；没有记录的账本不会出现在里面。
 */
export async function statsMap() {
  const rows = await getStorage().accountStats()
  const map = new Map()
  rows.forEach(function (r) {
    map.set(Number(r.account_id), {
      count: Number(r.c),
      incomeCents: Number(r.inc || 0),
      expenseCents: Number(r.exp || 0),
      lastAt: r.lastAt == null ? null : Number(r.lastAt)
    })
  })
  return map
}
