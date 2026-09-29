/**
 * 演示/测试存储：与 sqlite.js 方法签名完全一致。
 * 数据落在浏览器 localStorage（H5 预览）或进程内存（vitest），
 * 让 App 正式版（SQLite）与浏览器预览共用同一套上层代码。
 */

import { aid } from '../utils/constant.js'

const LS_KEY = 'cashDiary.memory.v1'

let data = null
let memBackend = null

function blank() {
  return { nextId: 1, category: [], transaction_record: [], account: [], budget: [], fixed_expense: [] }
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

/* ---------------- 落盘：防抖批量写 + 失败可感知（T3.9） ----------------
 * 每次写操作都 JSON.stringify 整库并同步写 localStorage，在数据量大时会明显卡顿，
 * 而且超过 5MB 会静默抛 QuotaExceededError —— 用户以为记上了，刷新后全没了。
 * 这里改成"内存即时生效 + 磁盘合并延迟写"，并把写入失败暴露给上层去提示用户。
 */

/** 落盘延迟：把连续写合并成一次（恢复备份时几百次写只落一次盘） */
const PERSIST_DELAY = 200

let persistTimer = null
let lastPersistError = null
let onPersistError = null

/** 立即写盘。失败不抛错：内存数据仍是正确的，不该让页面崩 */
function writeNow() {
  try {
    backend().setItem(LS_KEY, JSON.stringify(data))
    lastPersistError = null
    return true
  } catch (e) {
    const wasFailing = lastPersistError !== null
    lastPersistError = e
    // 只在"从正常转入失败"时通知一次，避免每次写操作都弹提示
    if (onPersistError && !wasFailing) {
      try { onPersistError(e) } catch (e2) { /* 回调自身出错不影响写入路径 */ }
    }
    return false
  }
}

/** 延迟落盘（内存已经是最新的，读数据不受影响） */
function persist() {
  if (persistTimer) return
  persistTimer = setTimeout(function () {
    persistTimer = null
    writeNow()
  }, PERSIST_DELAY)
}

/**
 * 立刻落盘、不等防抖。用于：事务收尾、页面卸载前、以及需要马上读磁盘的场景。
 * @returns {boolean} 是否写入成功
 */
export function flush() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  return writeNow()
}

/** 注册落盘失败处理器（App.vue 里注册：提示用户尽快导出备份） */
export function setPersistErrorHandler(fn) {
  onPersistError = typeof fn === 'function' ? fn : null
}

function nid() {
  return data.nextId++
}

/**
 * 事务：与 sqlite.js 的 transaction 同签名。
 * memory 侧用「整库快照」实现回滚——fn 抛错时数据恢复到事务前，
 * 与 SQLite 端"要么全做、要么全不做"的语义保持一致（契约测试依赖这一点）。
 */
export async function transaction(fn) {
  const snapshot = JSON.stringify(data)
  try {
    const result = await fn()
    flush()
    return result
  } catch (e) {
    data = JSON.parse(snapshot)
    flush()
    throw e
  }
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
        if (!Array.isArray(parsed.budget)) parsed.budget = []
        if (!Array.isArray(parsed.fixed_expense)) parsed.fixed_expense = []
        if (typeof parsed.nextId !== 'number') parsed.nextId = 1
        data = parsed
        return
      }
    } catch (e) { /* 损坏则重建 */ }
  }
  data = blank()
  flush()
}

/** 仅供测试：清空并重建（浏览器预览下慎用） */
export function reset() {
  data = blank()
  flush()
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

/**
 * 搜索：备注包含 noteKw（不区分大小写的包含匹配）或分类命中 categoryIds，
 * 两个条件"或"；都为空返回空。与 sqlite.js 的 txSearch 签名一致。
 */
export async function txSearch(noteKw, categoryIds, accountId, limit) {
  const a = aid(accountId)
  const max = Math.max(1, Math.floor(Number(limit) || 100))
  const kw = String(noteKw || '').toLowerCase()
  const ids = (Array.isArray(categoryIds) ? categoryIds : []).map(Number)
  if (!kw && !ids.length) return []
  return data.transaction_record
    .filter(function (r) {
      if (r.deleted_at != null || aid(r.account_id) !== a) return false
      const hitNote = kw && String(r.note || '').toLowerCase().indexOf(kw) !== -1
      const hitCat = ids.indexOf(Number(r.category_id)) !== -1
      return hitNote || hitCat
    })
    .sort(function (x, y) { return y.occurred_at - x.occurred_at })
    .slice(0, max)
    .map(function (r) { return Object.assign({}, r) })
}

export async function txInsert(rec) {
  const id = nid()
  // account_id 与 sqlite 侧同口径：写入时经 aid() 消毒，非法值落默认账本
  const row = Object.assign({ id: id }, rec, { account_id: aid(rec.account_id) })
  data.transaction_record.push(row)
  persist()
  return id
}

export async function txUpdate(id, patch) {
  const row = data.transaction_record.find(function (r) { return r.id === id })
  if (row) {
    // 与 sqlite 侧同构：updated_at 由适配器维护（patch 显式带则以 patch 为准）
    Object.keys(patch).forEach(function (k) { row[k] = patch[k] })
    if (patch.updated_at === undefined) row.updated_at = Date.now()
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

/** 改分类（名称 / 图标 / 排序） */
export async function categoryUpdate(id, patch) {
  const row = data.category.find(function (c) { return c.id === id })
  if (!row) return
  Object.keys(patch).forEach(function (k) { row[k] = patch[k] })
  persist()
}

/** 删分类。**不级联删流水**（调用方必须先确认该分类下没有记录），避免误删账目。 */
export async function categoryDelete(id) {
  data.category = data.category.filter(function (c) { return c.id !== id })
  persist()
}

/** 每个分类的流水笔数（未删除），供列表展示与"删除前检查" */
export async function categoryStats() {
  const agg = {}
  data.transaction_record.forEach(function (r) {
    if (r.deleted_at != null) return
    const k = String(r.category_id)
    agg[k] = (agg[k] || 0) + 1
  })
  return Object.keys(agg).map(function (k) { return { category_id: Number(k), c: agg[k] } })
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

/* ---------- 预算 CRUD ---------- */

/** 某账本的全部预算（总预算在前 + 各分类预算按 id 升序 —— 与 sqlite 的
    `ORDER BY category_id IS NULL DESC, id ASC` 同口径，契约测试覆盖） */
export async function budgetList(accountId) {
  const a = aid(accountId)
  return data.budget
    .filter(function (b) { return aid(b.account_id) === a })
    .sort(function (x, y) {
      const nx = x.category_id == null ? 1 : 0
      const ny = y.category_id == null ? 1 : 0
      return ny - nx || (x.id - y.id)
    })
    .map(function (b) { return Object.assign({}, b) })
}

/** 有则改、无则插（category_id 为 null 表示总预算） */
export async function budgetUpsert(rec) {
  const a = aid(rec.account_id)
  const cid = rec.category_id == null ? null : Number(rec.category_id)
  const row = data.budget.find(function (b) {
    return aid(b.account_id) === a && (b.category_id == null ? null : Number(b.category_id)) === cid
  })
  if (row) {
    row.limit_cents = rec.limit_cents
    row.updated_at = rec.updated_at || Date.now()
    persist()
    return row.id
  }
  const id = nid()
  data.budget.push({
    id: id,
    account_id: a,
    category_id: cid,
    limit_cents: rec.limit_cents,
    updated_at: rec.updated_at || Date.now()
  })
  persist()
  return id
}

/** 清除某条预算（总预算或某分类） */
export async function budgetRemove(accountId, categoryId) {
  const a = aid(accountId)
  const cid = categoryId == null ? null : Number(categoryId)
  data.budget = data.budget.filter(function (b) {
    const same = aid(b.account_id) === a && (b.category_id == null ? null : Number(b.category_id)) === cid
    return !same
  })
  persist()
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

/** 时间区间内的有效流水（左闭右开）—— 趋势图按区间一次取数，避免逐月查 6 次 */
export async function txListByRange(start, end, accountId) {
  const a = aid(accountId)
  return data.transaction_record
    .filter(function (r) {
      return r.deleted_at == null && aid(r.account_id) === a &&
        r.occurred_at >= start && r.occurred_at < end
    })
    .sort(function (x, y) { return x.occurred_at - y.occurred_at })
    .map(function (r) { return Object.assign({}, r) })
}

/* ---------- 固定支出 CRUD（每月自动补记的配置，v5） ---------- */

/** 当前账本的全部固定支出配置（启用在前，同组内按记账日升序） */
export async function fixedExpenseList(accountId) {
  const a = aid(accountId)
  return data.fixed_expense
    .filter(function (r) { return aid(r.account_id) === a })
    .sort(function (x, y) { return (y.enabled - x.enabled) || (x.day_of_month - y.day_of_month) || (x.id - y.id) })
    .map(function (r) { return Object.assign({}, r) })
}

export async function fixedExpenseInsert(rec) {
  const id = nid()
  // 与 sqlite 侧同口径：account_id 经 aid() 消毒（rec 显式带的非法值不允许穿透）
  data.fixed_expense.push(Object.assign({ id: id }, rec, { account_id: aid(rec.account_id) }))
  persist()
  return id
}

export async function fixedExpenseUpdate(id, patch) {
  const row = data.fixed_expense.find(function (r) { return r.id === id })
  if (!row) return
  Object.keys(patch).forEach(function (k) { row[k] = patch[k] })
  row.updated_at = Date.now()
  persist()
}

export async function fixedExpenseRemove(id) {
  const idx = data.fixed_expense.findIndex(function (r) { return r.id === id })
  if (idx !== -1) {
    data.fixed_expense.splice(idx, 1)
    persist()
  }
}

/** 清空全部业务数据（流水 + 分类 + 账本 + 预算），表结构保留 —— 供「重置数据」用 */
export async function clearAll() {
  data = blank()
  flush()
}

/* ---------- 备份：整库导出 / 整库恢复 ---------- */

const TABLES = ['account', 'category', 'transaction_record', 'budget', 'fixed_expense']

/** 导出用：原样返回四张表（**含软删除记录**，否则恢复后已删数据会"复活"） */
export async function dumpAll() {
  const out = {}
  TABLES.forEach(function (k) {
    out[k] = data[k].map(function (r) { return Object.assign({}, r) })
  })
  return out
}

/** 恢复用：整库替换（按原样写回，保留 id 关系）。调用方必须已校验过数据。
    与 sqlite.js 一致包在事务里：中途失败整体回滚，绝不留下半库。 */
export async function restoreAll(tables) {
  const t = tables || {}
  return transaction(async function () {
    data = blank()
    let maxId = 0
    TABLES.forEach(function (k) {
      const rows = Array.isArray(t[k]) ? t[k] : []
      rows.forEach(function (row) {
        data[k].push(Object.assign({}, row))
        const id = Number(row.id)
        if (Number.isFinite(id) && id > maxId) maxId = id
      })
    })
    // 自增起点必须大于已用的最大 id，否则之后新增记录会撞 id
    data.nextId = maxId + 1
  })
}
