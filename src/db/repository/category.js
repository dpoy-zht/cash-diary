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
