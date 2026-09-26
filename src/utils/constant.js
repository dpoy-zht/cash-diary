export const TYPE_EXPENSE = 'expense'
export const TYPE_INCOME = 'income'

/**
 * 默认账本 id：恒为 1。
 *
 * 三处必须一致，改一处就得三处一起改（所以抽成常量）：
 * - SQLite 迁移里 `account_id INTEGER NOT NULL DEFAULT 1`（老流水自动归到它）
 * - 账本种子里「日常账本」显式用这个 id 写入
 * - 流水查询/写入不带 accountId 时的兜底值
 */
export const DEFAULT_ACCOUNT_ID = 1
