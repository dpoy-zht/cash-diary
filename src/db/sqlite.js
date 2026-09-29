/**
 * App 端存储：HTML5+ plus.sqlite（原生 SQLite）。
 * 迁移机制：schema_migrations 表登记已执行版本，启动时按序补跑未执行的迁移脚本。
 */
import { sqlValue, likePattern } from './sql-value.js'
import { MIGRATIONS } from './schema.js'
import { aid } from '../utils/constant.js'

const DB_NAME = 'cash-diary'
const DB_PATH = '_doc/cash-diary.db'

function openDatabase() {
  return new Promise(function (resolve, reject) {
    plus.sqlite.openDatabase({ name: DB_NAME, path: DB_PATH, success: resolve, fail: reject })
  })
}

function executeBatch(statements) {
  return new Promise(function (resolve, reject) {
    plus.sqlite.executeSql({ name: DB_NAME, sql: statements, success: function () { resolve() }, fail: reject })
  })
}

function select(sql) {
  return new Promise(function (resolve, reject) {
    plus.sqlite.selectSql({ name: DB_NAME, sql: sql, success: resolve, fail: reject })
  })
}

function splitSql(sqlText) {
  return sqlText.split(';').map(function (s) { return s.trim() }).filter(Boolean)
}

/**
 * 事务：BEGIN → fn 内全部语句 → COMMIT；fn 抛错则 ROLLBACK 并把原错误上抛。
 * 恢复/迁移这类"多步写、绝不能做一半"的操作必须包在这里。
 * 依赖 plus.sqlite 支持 BEGIN/COMMIT/ROLLBACK（同一命名连接内顺序执行）；
 * 若真机不支持，BEGIN 会显式失败 —— 宁可恢复失败报错，也不留下半库。
 */
export async function transaction(fn) {
  await executeBatch(['BEGIN'])
  try {
    const result = await fn()
    await executeBatch(['COMMIT'])
    return result
  } catch (e) {
    try {
      await executeBatch(['ROLLBACK'])
    } catch (e2) { /* 回滚失败时以上抛的原错误为准 */ }
    throw e
  }
}

async function appliedVersions() {
  const rows = await select('SELECT version FROM schema_migrations')
  return rows.map(function (r) { return Number(r.version) })
}

export async function init() {
  await openDatabase()
  await executeBatch(splitSql('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)'))
  const done = await appliedVersions()
  for (const mig of MIGRATIONS) {
    if (done.indexOf(mig.version) !== -1) continue
    // 每个版本的「迁移 SQL + 版本登记」必须原子：中途失败整体回滚并中止启动，
    // 否则会出现"半迁移"——重启后既无新结构、也无登记记录，无法判定也无法续跑
    await transaction(async function () {
      await executeBatch(splitSql(mig.sql))
      await executeBatch([
        'INSERT INTO schema_migrations (version, applied_at) VALUES (' + mig.version + ', ' + Date.now() + ')'
      ])
    })
  }
}

/* ---------- 流水 CRUD ---------- */

export async function txListByMonth(start, end, accountId) {
  return select(
    'SELECT * FROM transaction_record ' +
    'WHERE deleted_at IS NULL AND account_id = ' + aid(accountId) + ' ' +
    'AND occurred_at >= ' + start + ' AND occurred_at < ' + end + ' ' +
    'ORDER BY occurred_at DESC'
  )
}

export async function txMonthSummary(start, end, accountId) {
  return select(
    'SELECT type, SUM(amount_cents) AS total FROM transaction_record ' +
    'WHERE deleted_at IS NULL AND account_id = ' + aid(accountId) + ' ' +
    'AND occurred_at >= ' + start + ' AND occurred_at < ' + end + ' ' +
    'GROUP BY type'
  )
}

export async function txInsert(rec) {
  const cols = ['account_id', 'category_id', 'type', 'amount_cents', 'note', 'occurred_at', 'created_at', 'updated_at']
  const vals = cols.map(function (c) {
    return c === 'account_id' ? String(aid(rec[c])) : sqlValue(rec[c])
  }).join(', ')
  await executeBatch(['INSERT INTO transaction_record (' + cols.join(',') + ') VALUES (' + vals + ')'])
}

export async function txUpdate(id, patch) {
  const sets = Object.keys(patch).map(function (k) { return k + ' = ' + sqlValue(patch[k]) }).join(', ')
  await executeBatch(['UPDATE transaction_record SET ' + sets + ' WHERE id = ' + Number(id)])
}

export async function txSoftDelete(id) {
  await txUpdate(id, { deleted_at: Date.now() })
}

/* ---------- 分类 CRUD ---------- */

export async function categoryList() {
  return select('SELECT * FROM category ORDER BY sort ASC, id ASC')
}

export async function categoryCount() {
  const rows = await select('SELECT COUNT(*) AS c FROM category')
  return Number(rows[0].c)
}

export async function categoryInsert(cat) {
  const cols = ['name', 'type', 'icon', 'sort']
  const vals = cols.map(function (c) { return sqlValue(cat[c]) }).join(', ')
  await executeBatch(['INSERT INTO category (' + cols.join(',') + ') VALUES (' + vals + ')'])
}

/** 改分类（名称 / 图标 / 排序） */
export async function categoryUpdate(id, patch) {
  const sets = Object.keys(patch).map(function (k) { return k + ' = ' + sqlValue(patch[k]) }).join(', ')
  if (!sets) return
  await executeBatch(['UPDATE category SET ' + sets + ' WHERE id = ' + Number(id)])
}

/** 删分类。**不级联删流水**（调用方必须先确认该分类下没有记录），避免误删账目。 */
export async function categoryDelete(id) {
  await executeBatch(['DELETE FROM category WHERE id = ' + Number(id)])
}

/** 每个分类的流水笔数（未删除），供列表展示与"删除前检查" */
export async function categoryStats() {
  return select(
    'SELECT category_id, COUNT(*) AS c FROM transaction_record ' +
    'WHERE deleted_at IS NULL GROUP BY category_id'
  )
}

/* ---------- 账本 CRUD ---------- */

export async function accountList() {
  return select('SELECT * FROM account ORDER BY id ASC')
}

export async function accountCount() {
  const rows = await select('SELECT COUNT(*) AS c FROM account')
  return Number(rows[0].c)
}

/** 新建账本。允许显式指定 id（默认账本必须恒为 1，与迁移里的 DEFAULT 1 对齐） */
export async function accountInsert(acc) {
  const cols = ['name', 'created_at']
  const vals = [sqlValue(acc.name), String(Number(acc.created_at || Date.now()))]
  if (acc.id != null) {
    cols.unshift('id')
    vals.unshift(String(Number(acc.id)))
  }
  await executeBatch(['INSERT INTO account (' + cols.join(',') + ') VALUES (' + vals.join(', ') + ')'])
}

export async function accountRename(id, name) {
  await executeBatch(['UPDATE account SET name = ' + sqlValue(name) + ' WHERE id = ' + Number(id)])
}

/** 删除账本。**不删它名下的流水**（调用方必须先确认没有流水），避免误删数据。 */
export async function accountRemove(id) {
  await executeBatch(['DELETE FROM account WHERE id = ' + Number(id)])
}

/** 每个账本的聚合：笔数、累计收支、最近一笔时间（供账本页列表） */
export async function accountStats() {
  return select(
    'SELECT account_id, COUNT(*) AS c, ' +
    "SUM(CASE WHEN type = 'income'  THEN amount_cents ELSE 0 END) AS inc, " +
    "SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) AS exp, " +
    'MAX(occurred_at) AS lastAt ' +
    'FROM transaction_record WHERE deleted_at IS NULL GROUP BY account_id'
  )
}

/* ---------- 预算 CRUD ---------- */

/** 某账本的全部预算（总预算 category_id 为 NULL + 各分类预算） */
export async function budgetList(accountId) {
  return select(
    'SELECT * FROM budget WHERE account_id = ' + aid(accountId) + ' ORDER BY category_id IS NULL DESC, id ASC'
  )
}

/** 有则改、无则插（category_id 传 null 表示总预算） */
export async function budgetUpsert(rec) {
  const a = aid(rec.account_id)
  const cid = rec.category_id == null ? null : Number(rec.category_id)
  const where = 'account_id = ' + a + ' AND category_id ' + (cid == null ? 'IS NULL' : '= ' + cid)
  const exists = await select('SELECT id FROM budget WHERE ' + where)
  const ts = Number(rec.updated_at || Date.now())
  if (exists && exists.length) {
    await executeBatch([
      'UPDATE budget SET limit_cents = ' + Number(rec.limit_cents) + ', updated_at = ' + ts + ' WHERE ' + where
    ])
    return Number(exists[0].id)
  }
  await executeBatch([
    'INSERT INTO budget (account_id, category_id, limit_cents, updated_at) VALUES (' +
    [a, cid == null ? 'NULL' : cid, Number(rec.limit_cents), ts].join(', ') + ')'
  ])
}

/** 清除某条预算（总预算或某分类） */
export async function budgetRemove(accountId, categoryId) {
  const cid = categoryId == null ? null : Number(categoryId)
  await executeBatch([
    'DELETE FROM budget WHERE account_id = ' + aid(accountId) +
    ' AND category_id ' + (cid == null ? 'IS NULL' : '= ' + cid)
  ])
}

/* ---------- 全量概览与维护 ---------- */

/** 全量（未删除）流水概览：笔数、累计收支、最早/最近时间；聚合交给 SQL，不在 JS 累加 */
export async function txOverview(accountId) {
  const rows = await select(
    'SELECT COUNT(*) AS c, ' +
    "SUM(CASE WHEN type = 'income'  THEN amount_cents ELSE 0 END) AS inc, " +
    "SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) AS exp, " +
    'MIN(occurred_at) AS firstAt, MAX(occurred_at) AS lastAt ' +
    'FROM transaction_record WHERE deleted_at IS NULL AND account_id = ' + aid(accountId)
  )
  return rows[0] || {}
}

/** 某时间点之后的所有（未删除）流水时间戳 —— 算连续记账天数用（本地日分组在 JS 做） */
export async function txRecentTimestamps(sinceTs, accountId) {
  const rows = await select(
    'SELECT occurred_at FROM transaction_record ' +
    'WHERE deleted_at IS NULL AND account_id = ' + aid(accountId) + ' ' +
    'AND occurred_at >= ' + Number(sinceTs)
  )
  return rows.map(function (r) { return Number(r.occurred_at) })
}

/** 时间区间内的有效流水（左闭右开）—— 趋势图按区间一次取数，避免逐月查 6 次 */
export async function txListByRange(start, end, accountId) {
  return select(
    'SELECT * FROM transaction_record ' +
    'WHERE deleted_at IS NULL AND account_id = ' + aid(accountId) + ' ' +
    'AND occurred_at >= ' + Number(start) + ' AND occurred_at < ' + Number(end) + ' ' +
    'ORDER BY occurred_at ASC'
  )
}

/**
 * 搜索：备注包含 noteKw（LIKE 包含匹配，通配符已转义）或分类命中 categoryIds。
 * 两个条件为"或"的关系；都为空则返回空（避免全表扫描式误用）。
 */
export async function txSearch(noteKw, categoryIds, accountId, limit) {
  const max = Math.max(1, Math.floor(Number(limit) || 100))
  const kw = String(noteKw || '')
  const ids = (Array.isArray(categoryIds) ? categoryIds : [])
    .map(Number)
    .filter(function (n) { return n > 0 })
  const conds = []
  if (kw) conds.push('note LIKE ' + likePattern(kw) + " ESCAPE '\\'")
  if (ids.length) conds.push('category_id IN (' + ids.join(',') + ')')
  if (!conds.length) return []
  return select(
    'SELECT * FROM transaction_record ' +
    'WHERE deleted_at IS NULL AND account_id = ' + aid(accountId) + ' ' +
    'AND (' + conds.join(' OR ') + ') ' +
    'ORDER BY occurred_at DESC LIMIT ' + max
  )
}

/* ---------- 固定支出 CRUD（每月自动补记的配置，v5） ---------- */

/** 当前账本的固定支出配置（启用在前，同组内按记账日升序） */
export async function fixedExpenseList(accountId) {
  return select(
    'SELECT * FROM fixed_expense WHERE account_id = ' + aid(accountId) + ' ' +
    'ORDER BY enabled DESC, day_of_month ASC, id ASC'
  )
}

export async function fixedExpenseInsert(rec) {
  await executeBatch([
    'INSERT INTO fixed_expense (account_id, category_id, amount_cents, note, day_of_month, ' +
    'last_posted_ym, enabled, created_at, updated_at) VALUES (' +
    aid(rec.account_id) + ', ' + Number(rec.category_id) + ', ' + Number(rec.amount_cents) + ', ' +
    sqlValue(rec.note) + ', ' + Number(rec.day_of_month) + ', ' + sqlValue(rec.last_posted_ym) + ', ' +
    (rec.enabled ? 1 : 0) + ', ' + Number(rec.created_at) + ', ' + Number(rec.updated_at) + ')'
  ])
  const rows = await select('SELECT MAX(id) AS id FROM fixed_expense')
  return rows && rows[0] ? Number(rows[0].id) : 0
}

export async function fixedExpenseUpdate(id, patch) {
  const sets = []
  if (patch.category_id !== undefined) sets.push('category_id = ' + Number(patch.category_id))
  if (patch.amount_cents !== undefined) sets.push('amount_cents = ' + Number(patch.amount_cents))
  if (patch.note !== undefined) sets.push('note = ' + sqlValue(patch.note))
  if (patch.day_of_month !== undefined) sets.push('day_of_month = ' + Number(patch.day_of_month))
  if (patch.last_posted_ym !== undefined) sets.push('last_posted_ym = ' + sqlValue(patch.last_posted_ym))
  if (patch.enabled !== undefined) sets.push('enabled = ' + (patch.enabled ? 1 : 0))
  if (!sets.length) return
  sets.push('updated_at = ' + Date.now())
  await executeBatch(['UPDATE fixed_expense SET ' + sets.join(', ') + ' WHERE id = ' + Number(id)])
}

export async function fixedExpenseRemove(id) {
  await executeBatch(['DELETE FROM fixed_expense WHERE id = ' + Number(id)])
}

/** 清空全部业务数据（流水 + 分类 + 账本），表结构不动 —— 供「重置数据」用
    sqlite_sequence 也要清，否则自增 id 会接着往下涨 */
export async function clearAll() {
  await executeBatch([
    'DELETE FROM transaction_record',
    'DELETE FROM category',
    'DELETE FROM account',
    'DELETE FROM budget',
    'DELETE FROM fixed_expense',
    "DELETE FROM sqlite_sequence WHERE name IN ('transaction_record','category','account','budget','fixed_expense')"
  ])
}

/* ---------- 备份：整库导出 / 整库恢复 ---------- */

/** 各表列名（导出/恢复共用，保证列顺序一致） */
const TABLE_COLS = {
  account: ['id', 'name', 'created_at'],
  category: ['id', 'name', 'type', 'icon', 'sort'],
  transaction_record: [
    'id', 'account_id', 'category_id', 'type', 'amount_cents', 'note',
    'occurred_at', 'created_at', 'updated_at', 'deleted_at'
  ],
  budget: ['id', 'account_id', 'category_id', 'limit_cents', 'updated_at'],
  fixed_expense: [
    'id', 'account_id', 'category_id', 'amount_cents', 'note',
    'day_of_month', 'last_posted_ym', 'enabled', 'created_at', 'updated_at'
  ]
}

function insertRow(table, row) {
  const cols = TABLE_COLS[table]
  const vals = cols.map(function (c) { return sqlValue(row[c]) }).join(', ')
  return 'INSERT INTO ' + table + ' (' + cols.join(',') + ') VALUES (' + vals + ')'
}

/** 导出用：原样返回四张表（**含软删除记录**，否则恢复后已删数据会"复活"） */
export async function dumpAll() {
  const out = {}
  for (const table of Object.keys(TABLE_COLS)) {
    out[table] = await select('SELECT * FROM ' + table)
  }
  return out
}

/**
 * 恢复用：整库替换（先清空，再按原 id 写回，保证表间关系不变）。调用方必须已校验过数据。
 * 清库 + 全部插入包在**同一个事务**里：中途任何一步失败（磁盘满/App 被杀/坏行）
 * 都整体回滚，库内数据与恢复前完全一致 —— 绝不允许"旧数据已清、新数据残缺"。
 */
export async function restoreAll(tables) {
  const t = tables || {}
  return transaction(async function () {
    await clearAll()
    for (const table of Object.keys(TABLE_COLS)) {
      const rows = Array.isArray(t[table]) ? t[table] : []
      if (!rows.length) continue
      await executeBatch(rows.map(function (row) { return insertRow(table, row) }))
    }
  })
}
