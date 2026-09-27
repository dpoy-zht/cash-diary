import { getStorage } from '../index.js'

function normalizeCat(row) {
  return {
    id: Number(row.id),
    name: row.name,
    type: row.type,
    icon: row.icon || '',
    sort: Number(row.sort) || 0
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
