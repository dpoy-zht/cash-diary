/**
 * App 端存储：HTML5+ plus.sqlite（原生 SQLite）。
 * 迁移机制：schema_migrations 表登记已执行版本，启动时按序补跑未执行的迁移脚本。
 */
import { sqlValue } from './sql-value.js'
import { buildTxSearchSql } from './tx-search-sql.js'
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
  // 外键约束默认关闭，显式打开（当前 schema 未声明 REFERENCES，纯为将来加约束兜底；
  // 删除分类/账本的保护仍以应用层检查为准）
  await executeBatch(['PRAGMA foreign_keys = ON'])
  await executeBatch(splitSql('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)'))
  const done = await appliedVersions()
  for (const mig of MIGRATIONS) {
    if (done.indexOf(mig.version) !== -1) continue
    // 每个版本的「迁移 SQL + 版本登记」必须原子：中途失败整体回滚并中止启动，
    // 否则会出现"半迁移"——重启后既无新结构、也无登记记录，无法判定也无法续跑。
    // 语句来源用 statements（每条一元素，T2.6），历史迁移无 statements 时退回 splitSql
    await transaction(async function () {
      const stmts = mig.statements || splitSql(mig.sql)
      await executeBatch(stmts)
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

/** 新增流水，返回新 id（plus.sqlite 拿不到 executeSql 的自增回执，
    需在同一连接立刻执行 last_insert_rowid()；契约见 tests/contract.test.js） */
export async function txInsert(rec) {
  const cols = ['account_id', 'category_id', 'type', 'amount_cents', 'note', 'occurred_at', 'created_at', 'updated_at']
  const vals = cols.map(function (c) {
    return c === 'account_id' ? String(aid(rec[c])) : sqlValue(rec[c])
  }).join(', ')
  await executeBatch(['INSERT INTO transaction_record (' + cols.join(',') + ') VALUES (' + vals + ')'])
  return lastInsertId()
}

/** 同连接取自增 id（无参数绑定风险：无外部输入） */
async function lastInsertId() {
  const rows = await select('SELECT last_insert_rowid() AS id')
  return rows && rows[0] ? Number(rows[0].id) : 0
}

/** 更新流水。字段白名单拒绝非预期字段（对齐 fixedExpenseUpdate 风格）；
    updated_at 由适配器统一维护（memory 侧同构），补齐"编辑但没传 updated_at"的口径。 */
const TX_UPDATE_FIELDS = ['category_id', 'type', 'amount_cents', 'note', 'occurred_at', 'deleted_at', 'updated_at']

export async function txUpdate(id, patch) {
  const sets = TX_UPDATE_FIELDS
    .filter(function (k) { return patch[k] !== undefined })
    .map(function (k) { return k + ' = ' + sqlValue(patch[k]) })
  if (patch.updated_at === undefined) sets.push('updated_at = ' + Date.now())
  if (!sets.length) return
  await executeBatch(['UPDATE transaction_record SET ' + sets.join(', ') + ' WHERE id = ' + Number(id)])
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

/** 新建账本。允许显式指定 id（默认账本必须恒为 1，与迁移里的 DEFAULT 1 对齐）。返回新 id */
export async function accountInsert(acc) {
  const cols = ['name', 'created_at']
  const vals = [sqlValue(acc.name), String(Number(acc.created_at || Date.now()))]
  if (acc.id != null) {
    cols.unshift('id')
    vals.unshift(String(Number(acc.id)))
  }
  await executeBatch(['INSERT INTO account (' + cols.join(',') + ') VALUES (' + vals.join(', ') + ')'])
  return lastInsertId()
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
/**
 * 搜索（T4.3 起支持组合筛选）。语义与 memory.js 的同名函数**必须逐条一致**：
 *
 * - 关键词组（组内 OR）：`note LIKE 关键词` **或** `category_id IN 关键词命中的分类`
 *   —— 也就是原来的行为，用户搜"奶茶"既能搜到备注、也能搜到分类叫"奶茶"的账。
 * - 显式筛选组（组内 AND）：类型 / 分类多选 / 金额区间 / 日期区间，**逐条收窄**。
 * - 两组之间是 AND：关键词负责"找"，筛选负责"筛"。
 * - 一组都没有 → 返回空数组（不做全表扫描）。
 *
 * ⚠️ SQL 的拼装与转义细节（sqlValue / likePattern / 括号结构）全在
 * `db/tx-search-sql.js` 里，那里是纯函数、有逐字断言；本函数只负责"拼不出来就别查"。
 * 之所以挪走：plus.sqlite 不支持参数绑定，值全是拼串，而这段代码在开发机上跑不到
 * （只有真机有 plus.sqlite），拼错一个字符就是"搜不到任何东西"。
 *
 * @param {string} noteKw 关键词（空串 = 不按关键词过滤）
 * @param {number[]} kwCategoryIds 关键词命中的分类 id（与 noteKw 是「或」）
 * @param {number} accountId 账本
 * @param {number} limit 返回上限
 * @param {{type?:string, categoryIds?:number[], minCents?:number, maxCents?:number, startTs?:number, endTs?:number}} [filters]
 */
export async function txSearch(noteKw, kwCategoryIds, accountId, limit, filters) {
  // SQL 拼装抽到 tx-search-sql.js 里做成纯函数，好在 Node 侧逐字断言（见那边的注释）
  const sql = buildTxSearchSql(noteKw, kwCategoryIds, accountId, limit, filters)
  if (!sql) return []
  return select(sql)
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
  // 与 txInsert/accountInsert 同口径：同连接 last_insert_rowid()，不依赖 MAX(id)（并发下会错）
  return lastInsertId()
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

/* ---------- 标签 CRUD（T5.1） ---------- */

export async function tagList(accountId) {
  return select('SELECT * FROM tag WHERE account_id = ' + Number(accountId) + ' ORDER BY sort ASC, id ASC')
}

export async function tagInsert(row) {
  const cols = ['account_id', 'name', 'color', 'sort', 'created_at', 'updated_at']
  const vals = cols.map(function (c) { return sqlValue(row[c]) }).join(', ')
  await executeBatch(['INSERT INTO tag (' + cols.join(',') + ') VALUES (' + vals + ')'])
  const rows = await select('SELECT last_insert_rowid() AS id')
  return Number(rows[0] && rows[0].id)
}

export async function tagUpdate(id, patch) {
  const sets = Object.keys(patch).map(function (k) { return k + ' = ' + sqlValue(patch[k]) }).join(', ')
  if (!sets) return
  await executeBatch(['UPDATE tag SET ' + sets + ' WHERE id = ' + Number(id)])
}

/** 删标签：连同它的关联一起删（调用方必须先确认没有流水在引用） */
export async function tagDelete(id) {
  const tid = Number(id)
  await transaction(async function () {
    await executeBatch(['DELETE FROM transaction_tag WHERE tag_id = ' + tid])
    await executeBatch(['DELETE FROM tag WHERE id = ' + tid])
  })
}

/** 这个标签被多少笔**未删除**的流水引用（删除前的安全检查） */
export async function tagRefCount(tagId) {
  const rows = await select(
    'SELECT COUNT(*) AS c FROM transaction_tag tt ' +
    'JOIN transaction_record t ON t.id = tt.transaction_id ' +
    'WHERE tt.tag_id = ' + Number(tagId) + ' AND t.deleted_at IS NULL'
  )
  return Number(rows[0] && rows[0].c)
}

/** 每个标签被多少笔**未删除**流水引用（标签管理页展示 + 删除前检查；一次查完，不做 N 次） */
export async function tagUsageCounts(accountId) {
  return select(
    'SELECT tt.tag_id AS tag_id, COUNT(*) AS c FROM transaction_tag tt ' +
    'JOIN transaction_record t ON t.id = tt.transaction_id ' +
    'WHERE t.deleted_at IS NULL AND t.account_id = ' + aid(accountId) + ' ' +
    'GROUP BY tt.tag_id'
  )
}

/** 覆写一笔流水的标签集合（先清后插，包在同一事务里，避免中途失败留下半套标签） */
export async function txTagSetForTx(txId, tagIds) {
  const id = Number(txId)
  const ids = (Array.isArray(tagIds) ? tagIds : []).map(Number).filter(function (n) {
    return Number.isInteger(n) && n > 0
  })
  await transaction(async function () {
    await executeBatch(['DELETE FROM transaction_tag WHERE transaction_id = ' + id])
    if (!ids.length) return
    await executeBatch(ids.map(function (t) {
      return 'INSERT INTO transaction_tag (transaction_id, tag_id) VALUES (' + id + ', ' + t + ')'
    }))
  })
}

/** 一批流水各自的标签关联（按 tx id 批量取，避免 N+1） */
export async function txTagRowsByTxs(txIds) {
  const ids = (Array.isArray(txIds) ? txIds : []).map(Number).filter(function (n) {
    return Number.isInteger(n) && n > 0
  })
  if (!ids.length) return []
  return select('SELECT transaction_id, tag_id FROM transaction_tag WHERE transaction_id IN (' + ids.join(',') + ')')
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
    'DELETE FROM transaction_tag',
    'DELETE FROM tag',
    "DELETE FROM sqlite_sequence WHERE name IN ('transaction_record','category','account','budget','fixed_expense','tag')"
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
  ],
  tag: ['id', 'account_id', 'name', 'color', 'sort', 'created_at', 'updated_at'],
  transaction_tag: ['transaction_id', 'tag_id']
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
