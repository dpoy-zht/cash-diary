/**
 * MVP v1 建表结构。
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

/** 迁移登记：按版本号顺序执行。新增结构变更 → 追加一项，禁止修改已发布的版本。 */
export const MIGRATIONS = [
  { version: 1, name: 'v1_init', sql: SCHEMA_SQL }
]
