/**
 * App 端存储：HTML5+ plus.sqlite（原生 SQLite）。
 * 迁移机制：schema_migrations 表登记已执行版本，启动时按序补跑未执行的迁移脚本。
 */
import { sqlValue } from './sql-value.js'
import { MIGRATIONS } from './schema.js'
import { DEFAULT_ACCOUNT_ID } from '../utils/constant.js'

const DB_NAME = 'cash-diary'
const DB_PATH = '_doc/cash-diary.db'

/** 账本过滤：不传/非法值一律落到默认账本 */
function aid(v) {
  return typeof v === 'number' && v > 0 ? v : DEFAULT_ACCOUNT_ID
}

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
    await executeBatch(splitSql(mig.sql))
    await executeBatch([
      'INSERT INTO schema_migrations (version, applied_at) VALUES (' + mig.version + ', ' + Date.now() + ')'
    ])
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

/** 清空全部业务数据（流水 + 分类 + 账本），表结构不动 —— 供「重置数据」用
    sqlite_sequence 也要清，否则自增 id 会接着往下涨 */
export async function clearAll() {
  await executeBatch([
    'DELETE FROM transaction_record',
    'DELETE FROM category',
    'DELETE FROM account',
    "DELETE FROM sqlite_sequence WHERE name IN ('transaction_record','category','account')"
  ])
}
