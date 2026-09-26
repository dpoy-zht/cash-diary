/**
 * 演示/测试存储：与 sqlite.js 方法签名完全一致。
 * 数据落在浏览器 localStorage（H5 预览）或进程内存（vitest），
 * 让 App 正式版（SQLite）与浏览器预览共用同一套上层代码。
 */

import { DEFAULT_ACCOUNT_ID } from '../utils/constant.js'

const LS_KEY = 'cashDiary.memory.v1'

let data = null
let memBackend = null

function blank() {
  return { nextId: 1, category: [], transaction_record: [], account: [] }
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

/** 账本过滤：不传/非法值一律落到默认账本 */
function aid(v) {
  return typeof v === 'number' && v > 0 ? v : DEFAULT_ACCOUNT_ID
}

export async function init() {
  const raw = backend().getItem(LS_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.category)) {
        // 兼容旧结构：缺哪张表补哪张，避免老种子数据把页面打崩
        if (!Array.isArray(parsed.transaction_record)) parsed.transaction_record = []
        if (!Array.isArray(parsed.account)) parsed.account = []
        if (typeof parsed.nextId !== 'number') parsed.nextId = 1
        data = parsed
        return
      }
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

export async function txListByMonth(start, end, accountId) {
  const a = aid(accountId)
  return data.transaction_record
    .filter(function (r) {
      return r.deleted_at == null && aid(r.account_id) === a &&
        r.occurred_at >= start && r.occurred_at < end
    })
    .sort(function (a, b) { return b.occurred_at - a.occurred_at })
    .map(function (r) { return Object.assign({}, r) })
}

export async function txMonthSummary(start, end, accountId) {
  const a = aid(accountId)
  const agg = {}
  data.transaction_record.forEach(function (r) {
    if (r.deleted_at != null || aid(r.account_id) !== a) return
    if (r.occurred_at < start || r.occurred_at >= end) return
    agg[r.type] = (agg[r.type] || 0) + r.amount_cents
  })
  return Object.keys(agg).map(function (type) { return { type: type, total: agg[type] } })
}

export async function txInsert(rec) {
  const id = nid()
  const row = Object.assign({ account_id: DEFAULT_ACCOUNT_ID }, rec)
  data.transaction_record.push(Object.assign({ id: id }, row))
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

/* ---------- 账本 CRUD ---------- */

export async function accountList() {
  return data.account
    .slice()
    .sort(function (a, b) { return a.id - b.id })
    .map(function (a) { return Object.assign({}, a) })
}

export async function accountCount() {
  return data.account.length
}

/** 新建账本。允许显式指定 id —— 默认账本必须恒为 1（本适配器各表共用一个自增计数器，
    不显式指定的话，先插了 20 个分类之后账本会拿到 21，与 SQLite 的口径就不一致了）。 */
export async function accountInsert(acc) {
  const id = acc.id != null ? Number(acc.id) : nid()
  if (id >= data.nextId) data.nextId = id + 1
  data.account.push({ id: id, name: acc.name, created_at: acc.created_at || Date.now() })
  persist()
  return id
}

export async function accountRename(id, name) {
  const row = data.account.find(function (a) { return a.id === id })
  if (row) {
    row.name = name
    persist()
  }
}

/** 删除账本。**不删它名下的流水**（调用方必须先确认没有流水），避免误删数据。 */
export async function accountRemove(id) {
  data.account = data.account.filter(function (a) { return a.id !== id })
  persist()
}

/** 每个账本的聚合：笔数、累计收支、最近一笔时间（供账本页列表） */
export async function accountStats() {
  const agg = {}
  data.transaction_record.forEach(function (r) {
    if (r.deleted_at != null) return
    const a = aid(r.account_id)
    const cur = agg[a] || { account_id: a, c: 0, inc: 0, exp: 0, lastAt: null }
    cur.c += 1
    if (r.type === 'income') cur.inc += r.amount_cents
    else if (r.type === 'expense') cur.exp += r.amount_cents
    if (cur.lastAt == null || r.occurred_at > cur.lastAt) cur.lastAt = r.occurred_at
    agg[a] = cur
  })
  return Object.keys(agg).map(function (k) { return agg[k] })
}

/* ---------- 全量概览与维护 ---------- */

/** 全量（未删除）流水概览：笔数、累计收支、最早/最近时间；空库时 c=0、时间为 null */
export async function txOverview(accountId) {
  const a = aid(accountId)
  const rows = data.transaction_record.filter(function (r) {
    return r.deleted_at == null && aid(r.account_id) === a
  })
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

/** 某时间点之后的所有（未删除）流水时间戳 —— 算连续记账天数用 */
export async function txRecentTimestamps(sinceTs, accountId) {
  const a = aid(accountId)
  return data.transaction_record
    .filter(function (r) {
      return r.deleted_at == null && aid(r.account_id) === a && r.occurred_at >= sinceTs
    })
    .map(function (r) { return r.occurred_at })
}

/** 清空全部业务数据（流水 + 分类 + 账本），表结构保留 —— 供「重置数据」用 */
export async function clearAll() {
  data = blank()
  persist()
}
