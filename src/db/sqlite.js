/**
 * App 端存储：HTML5+ plus.sqlite（原生 SQLite）。
 * 迁移机制：schema_migrations 表登记已执行版本，启动时按序补跑未执行的迁移脚本。
 */
import { sqlValue } from './sql-value.js'
import { MIGRATIONS } from './schema.js'

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

export async function txListByMonth(start, end) {
  return select(
    'SELECT * FROM transaction_record ' +
    'WHERE deleted_at IS NULL AND occurred_at >= ' + start + ' AND occurred_at < ' + end + ' ' +
    'ORDER BY occurred_at DESC'
  )
}

export async function txMonthSummary(start, end) {
  return select(
    'SELECT type, SUM(amount_cents) AS total FROM transaction_record ' +
    'WHERE deleted_at IS NULL AND occurred_at >= ' + start + ' AND occurred_at < ' + end + ' ' +
    'GROUP BY type'
  )
}

export async function txInsert(rec) {
  const cols = ['category_id', 'type', 'amount_cents', 'note', 'occurred_at', 'created_at', 'updated_at']
  const vals = cols.map(function (c) { return sqlValue(rec[c]) }).join(', ')
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

/* ---------- 全量概览与维护 ---------- */

/** 全量（未删除）流水概览：笔数、累计收支、最早/最近时间；聚合交给 SQL，不在 JS 累加 */
export async function txOverview() {
  const rows = await select(
    'SELECT COUNT(*) AS c, ' +
    "SUM(CASE WHEN type = 'income'  THEN amount_cents ELSE 0 END) AS inc, " +
    "SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) AS exp, " +
    'MIN(occurred_at) AS firstAt, MAX(occurred_at) AS lastAt ' +
    'FROM transaction_record WHERE deleted_at IS NULL'
  )
  return rows[0] || {}
}

/** 清空全部业务数据（流水 + 分类），表结构不动 —— 供「重置数据」用
    sqlite_sequence 也要清，否则自增 id 会接着往下涨 */
export async function clearAll() {
  await executeBatch([
    'DELETE FROM transaction_record',
    'DELETE FROM category',
    "DELETE FROM sqlite_sequence WHERE name IN ('transaction_record','category')"
  ])
}

