export const TYPE_EXPENSE = 'expense'
export const TYPE_INCOME = 'income'

/**
 * JS 侧要用的主题色 —— CSS 变量到不了的地方：
 * uni 组件的 `switch color` 属性和 `uni.showModal({ confirmColor })` 只收字面量色值。
 * 取值必须与 App.vue 里的 --cd-primary / --cd-danger-ink 保持一致（有测试比对）。
 */
export const UI_PRIMARY = '#ffd93d'
export const UI_DANGER = '#b93b39'

/**
 * 默认账本 id：恒为 1。
 *
 * 三处必须一致，改一处就得三处一起改（所以抽成常量）：
 * - SQLite 迁移里 `account_id INTEGER NOT NULL DEFAULT 1`（老流水自动归到它）
 * - 账本种子里「日常账本」显式用这个 id 写入
 * - 流水查询/写入不带 accountId 时的兜底值
 */
export const DEFAULT_ACCOUNT_ID = 1

/**
 * 账本过滤兜底：不传/非法值一律落到默认账本。
 * 原来 db/sqlite.js、db/memory.js、db/repository/tx.js、db/repository/fixed.js 四处各有一份
 * 一模一样的实现，收敛到这里统一维护（行为约定见 DEFAULT_ACCOUNT_ID）。
 */
export function aid(v) {
  return typeof v === 'number' && v > 0 ? v : DEFAULT_ACCOUNT_ID
}
