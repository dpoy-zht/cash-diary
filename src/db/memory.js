/**
 * 演示/测试存储：与 sqlite.js 方法签名完全一致。
 * 数据落在浏览器 localStorage（H5 预览）或进程内存（vitest），
 * 让 App 正式版（SQLite）与浏览器预览共用同一套上层代码。
 */

const LS_KEY = 'cashDiary.memory.v1'

let data = null
let memBackend = null

function blank() {
  return { nextId: 1, category: [], transaction_record: [] }
}

function backend() {
  if (typeof localStorage !== 'undefined') return localStorage
  // 无 localStorage（Node/vitest）：复用同一个 Map，保证读写一致
  if (!memBackend) {
    const mem = new Map()
    memBackend = {
      getItem: function (k) { return mem.has(k) ? mem.get(k) : null },
      setItem: function (k, v) { mem.set(k, String(v)) },
      removeItem: function (k) { mem.delete(k) }
    }
  }
  return memBackend
}

function persist() {
  backend().setItem(LS_KEY, JSON.stringify(data))
}

function nid() {
  return data.nextId++
}

export async function init() {
  const raw = backend().getItem(LS_KEY)
  if (raw) {
    try {
      data = JSON.parse(raw)
      if (data && Array.isArray(data.category)) return
    } catch (e) { /* 损坏则重建 */ }
  }
  data = blank()
  persist()
}

/** 仅供测试：清空并重建（浏览器预览下慎用） */
export function reset() {
  data = blank()
  persist()
}

/* ---------- 流水 CRUD ---------- */

export async function txListByMonth(start, end) {
  return data.transaction_record
    .filter(function (r) { return r.deleted_at == null && r.occurred_at >= start && r.occurred_at < end })
    .sort(function (a, b) { return b.occurred_at - a.occurred_at })
    .map(function (r) { return Object.assign({}, r) })
}

export async function txMonthSummary(start, end) {
  const agg = {}
  data.transaction_record.forEach(function (r) {
    if (r.deleted_at != null || r.occurred_at < start || r.occurred_at >= end) return
    agg[r.type] = (agg[r.type] || 0) + r.amount_cents
  })
  return Object.keys(agg).map(function (type) { return { type: type, total: agg[type] } })
}

export async function txInsert(rec) {
  const id = nid()
  const row = Object.assign({ id: id }, rec)
  data.transaction_record.push(row)
  persist()
  return id
}

export async function txUpdate(id, patch) {
  const row = data.transaction_record.find(function (r) { return r.id === id })
  if (row) {
    Object.keys(patch).forEach(function (k) { row[k] = patch[k] })
    row.updated_at = Date.now()
    persist()
  }
}

export async function txSoftDelete(id) {
  await txUpdate(id, { deleted_at: Date.now() })
}

/* ---------- 分类 CRUD ---------- */

export async function categoryList() {
  return data.category
    .slice()
    .sort(function (a, b) { return a.sort - b.sort || a.id - b.id })
    .map(function (c) { return Object.assign({}, c) })
}

export async function categoryCount() {
  return data.category.length
}

export async function categoryInsert(cat) {
  const id = nid()
  data.category.push(Object.assign({ id: id }, cat))
  persist()
  return id
}

/* ---------- 全量概览与维护 ---------- */

/** 全量（未删除）流水概览：笔数、累计收支、最早/最近时间；空库时 c=0、时间为 null */
export async function txOverview() {
  const rows = data.transaction_record.filter(function (r) { return r.deleted_at == null })
  let inc = 0
  let exp = 0
  let firstAt = null
  let lastAt = null
  rows.forEach(function (r) {
    if (r.type === 'income') inc += r.amount_cents
    else if (r.type === 'expense') exp += r.amount_cents
    if (firstAt == null || r.occurred_at < firstAt) firstAt = r.occurred_at
    if (lastAt == null || r.occurred_at > lastAt) lastAt = r.occurred_at
  })
  return { c: rows.length, inc: inc, exp: exp, firstAt: firstAt, lastAt: lastAt }
}

/** 清空全部业务数据（流水 + 分类），表结构保留 —— 供「重置数据」用 */
export async function clearAll() {
  data = blank()
  persist()
}

