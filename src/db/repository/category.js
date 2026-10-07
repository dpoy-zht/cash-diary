import { getStorage } from '../index.js'

/**
 * 归一化分类行。
 * `parent_id` 为 NULL/undefined → `null`（一级分类）；否则转成数字。
 * 老库（v6 及以前）没有这一列，`row.parent_id` 取到 undefined，正好落成一级，
 * 与迁移的意图一致 —— 不需要为老数据单独分支。
 */
function normalizeCat(row) {
  return {
    id: Number(row.id),
    name: row.name,
    type: row.type,
    icon: row.icon || '',
    sort: Number(row.sort) || 0,
    parent_id: row.parent_id == null ? null : Number(row.parent_id)
  }
}

export async function listAll() {
  const rows = await getStorage().categoryList()
  return rows.map(normalizeCat)
}

export async function count() {
  return getStorage().categoryCount()
}

export async function insert(cat) {
  return getStorage().categoryInsert(cat)
}

export async function update(id, patch) {
  return getStorage().categoryUpdate(id, patch)
}

export async function remove(id) {
  return getStorage().categoryDelete(id)
}

/** 每个分类的流水笔数（未删除），返回 Map：category_id → 笔数 */
export async function statsMap() {
  const rows = await getStorage().categoryStats()
  const map = new Map()
  rows.forEach(function (r) {
    map.set(Number(r.category_id), Number(r.c))
  })
  return map
}
