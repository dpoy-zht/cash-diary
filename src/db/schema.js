/**
 * 建表结构 + 版本迁移。
 * 约束即文档：CHECK 把"金额必须为正整数分""类型只能是 income/expense"钉死在数据库层。
 * 铁律：金额整数分、时间毫秒时间戳、软删除 deleted_at。
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS category (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL,
  type    TEXT    NOT NULL CHECK (type IN ('income','expense')),
  icon    TEXT    NOT NULL DEFAULT '',
  sort    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transaction_record (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER NOT NULL,
  type         TEXT    NOT NULL CHECK (type IN ('income','expense')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  note         TEXT    NOT NULL DEFAULT '',
  occurred_at  INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tx_time ON transaction_record(occurred_at);
CREATE INDEX IF NOT EXISTS idx_tx_del  ON transaction_record(deleted_at);
`

/**
 * v2：多账本。
 *
 * `account_id` 用 `NOT NULL DEFAULT 1` 加列 —— **已有流水会自动归属到默认账本**，
 * 所以这次迁移不用清库、不丢数据。
 * 默认账本那一行由 services/account.js 的 seedDefaultIfEmpty() 写入，
 * 两个适配器（sqlite / memory）走同一套逻辑。
 */
export const ACCOUNT_SQL = `
CREATE TABLE IF NOT EXISTS account (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

ALTER TABLE transaction_record ADD COLUMN account_id INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_tx_account ON transaction_record(account_id);
`

/**
 * v3：预算。
 *
 * 两个刻意的设计取舍（与 PLAN §3.2 的草案不同，改起来更方便用）：
 * 1. **不存 month**：预算按账本设一次、每月都生效（"我每月预算 5000"），
 *    比每月都要重设一遍友好得多。要改成按月可以后续加列。
 * 2. **category_id 为 NULL 表示"总预算"**，非空表示"某个分类的预算"。
 *    唯一性不靠数据库约束（SQLite 里 NULL 在 UNIQUE 索引中互不相等，约束不住），
 *    由 services/budget.js 做"先查再改/插"。
 */
export const BUDGET_SQL = `
CREATE TABLE IF NOT EXISTS budget (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL DEFAULT 1,
  category_id INTEGER,
  limit_cents INTEGER NOT NULL CHECK (limit_cents > 0),
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budget_acc ON budget(account_id);
`

/**
 * v4：查询性能索引。
 *
 * 高频查询模式（首页/统计/搜索/趋势）都是
 * `WHERE deleted_at IS NULL AND account_id = ? AND occurred_at ∈ [start, end)`。
 * v1/v2 的单列索引（idx_tx_time、idx_tx_account）在多账本 + 时间范围下需要二次过滤，
 * 复合索引 (account_id, occurred_at) 一次命中。IF NOT EXISTS 保证幂等。
 */
export const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_tx_account_time ON transaction_record(account_id, occurred_at);
`

/**
 * v5：固定支出（房租/会员费这类每月固定要记的账）。
 *
 * 设计要点：
 * - **day_of_month 限 1~28**：避开 2 月没有 30/31 号的坑，永远能落到当月
 * - **last_posted_ym 记"最近一次已记账的月份"**（'YYYY-MM'）：
 *   打开 App 时补记当月一笔，靠它防重复记账；空串 = 从没记过
 * - **enabled 软开关**：停用不删记录，配置保留
 */
export const FIXED_EXPENSE_SQL = `
CREATE TABLE IF NOT EXISTS fixed_expense (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id     INTEGER NOT NULL DEFAULT 1,
  category_id    INTEGER NOT NULL,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  note           TEXT    NOT NULL DEFAULT '',
  day_of_month   INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  last_posted_ym TEXT    NOT NULL DEFAULT '',
  enabled        INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fixed_acc ON fixed_expense(account_id);
`

/**
 * 迁移登记：按版本号顺序执行。新增结构变更 → 追加一项，禁止修改已发布的版本。
 *
 * T2.6：每个迁移新增 `statements` 数组 —— **每条 SQL 一个元素**，执行时不再按
 * 分号盲切（旧 splitSql 会把 SQL 字符串字面量里的分号切坏）。`sql` 保留为
 * 可读原文（历史文档口径），statements 是权威执行源，两者一致性由 schema 测试锁定。
 */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'v1_init',
    sql: SCHEMA_SQL,
    statements: [
      `CREATE TABLE IF NOT EXISTS category (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL,
  type    TEXT    NOT NULL CHECK (type IN ('income','expense')),
  icon    TEXT    NOT NULL DEFAULT '',
  sort    INTEGER NOT NULL DEFAULT 0
)`,
      `CREATE TABLE IF NOT EXISTS transaction_record (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER NOT NULL,
  type         TEXT    NOT NULL CHECK (type IN ('income','expense')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  note         TEXT    NOT NULL DEFAULT '',
  occurred_at  INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
)`,
      'CREATE INDEX IF NOT EXISTS idx_tx_time ON transaction_record(occurred_at)',
      'CREATE INDEX IF NOT EXISTS idx_tx_del  ON transaction_record(deleted_at)'
    ]
  },
  {
    version: 2,
    name: 'v2_multi_account',
    sql: ACCOUNT_SQL,
    statements: [
      `CREATE TABLE IF NOT EXISTS account (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
)`,
      'ALTER TABLE transaction_record ADD COLUMN account_id INTEGER NOT NULL DEFAULT 1',
      'CREATE INDEX IF NOT EXISTS idx_tx_account ON transaction_record(account_id)'
    ]
  },
  {
    version: 3,
    name: 'v3_budget',
    sql: BUDGET_SQL,
    statements: [
      `CREATE TABLE IF NOT EXISTS budget (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL DEFAULT 1,
  category_id INTEGER,
  limit_cents INTEGER NOT NULL CHECK (limit_cents > 0),
  updated_at  INTEGER NOT NULL
)`,
      'CREATE INDEX IF NOT EXISTS idx_budget_acc ON budget(account_id)'
    ]
  },
  {
    version: 4,
    name: 'v4_query_index',
    sql: INDEX_SQL,
    statements: [
      'CREATE INDEX IF NOT EXISTS idx_tx_account_time ON transaction_record(account_id, occurred_at)'
    ]
  },
  {
    version: 5,
    name: 'v5_fixed_expense',
    sql: FIXED_EXPENSE_SQL,
    statements: [
      `CREATE TABLE IF NOT EXISTS fixed_expense (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id     INTEGER NOT NULL DEFAULT 1,
  category_id    INTEGER NOT NULL,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  note           TEXT    NOT NULL DEFAULT '',
  day_of_month   INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  last_posted_ym TEXT    NOT NULL DEFAULT '',
  enabled        INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
)`,
      'CREATE INDEX IF NOT EXISTS idx_fixed_acc ON fixed_expense(account_id)'
    ]
  }
]
