/**
 * 备份文件的打包 / 校验（纯函数，全部可单测）。
 *
 * 设计要点：
 * - 备份**带版本号**：将来表结构变了，靠它判断能不能直接恢复
 * - 校验是**整份、只读**的：先确认整份文件合法再动数据库，
 *   绝不允许"恢复了一半失败"留下残缺数据
 * - 备份里保留 `deleted_at`：软删除的记录也要一起搬走，
 *   否则恢复后另一端又会把已删数据同步回来（数据铁律 3）
 */

export const BACKUP_VERSION = 2
/** 备份文件里的身份标记，用来挡掉"随便一个 json" */
export const BACKUP_APP = 'cash-diary'

/**
 * 打包成可序列化的备份对象。
 * @param {{account:Array, category:Array, transaction_record:Array, budget:Array, fixed_expense?:Array}} tables
 * @param {number} exportedAt 导出时间（毫秒时间戳）
 */
export function buildBackup(tables, exportedAt) {
  const t = tables || {}
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: Number(exportedAt || Date.now()),
    account: Array.isArray(t.account) ? t.account : [],
    category: Array.isArray(t.category) ? t.category : [],
    transaction_record: Array.isArray(t.transaction_record) ? t.transaction_record : [],
    budget: Array.isArray(t.budget) ? t.budget : [],
    fixed_expense: Array.isArray(t.fixed_expense) ? t.fixed_expense : []
  }
}

/** 备份文件名：奶龙记账-备份-2026-09-27-1320.json */
export function backupFileName(nowTs) {
  const d = new Date(nowTs == null ? Date.now() : nowTs)
  function p(n) {
    return String(n).padStart(2, '0')
  }
  const stamp =
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes())
  return '奶龙记账-备份-' + stamp + '.json'
}

/* ---------------- 自动备份（打开 App 时静默写入私有目录） ---------------- */

/** 自动备份间隔：24 小时 */
export const AUTO_BACKUP_INTERVAL = 24 * 60 * 60 * 1000
/** 自动备份文件名前缀：清理旧文件时只动带此前缀的，用户手动导出的备份绝不碰 */
export const AUTO_BACKUP_PREFIX = '奶龙记账-自动备份-'
/** 上次自动备份时间戳的存储键（services/backup.js 写入，数据体检读来判断"备份过旧"） */
export const AUTO_BACKUP_LAST_KEY = 'cashDiary.autoBackup.lastAt'
/** 自动备份保留份数（清理时只留最新 N 份） */
export const AUTO_KEEP_COUNT = 3

/** 自动备份文件名：奶龙记账-自动备份-2026-09-28-0012.json（前缀定长，字典序=时间序） */
export function autoBackupFileName(nowTs) {
  const d = new Date(nowTs == null ? Date.now() : nowTs)
  function p(n) {
    return String(n).padStart(2, '0')
  }
  const stamp =
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes())
  return AUTO_BACKUP_PREFIX + stamp + '.json'
}

/**
 * 判断是否该做自动备份：没备份过 / 距上次已超过间隔 → true。
 * lastAt 非法（0/null/NaN）视为从未备份，避免异常数据把备份静默关掉。
 */
export function shouldAutoBackup(lastAt, nowTs, interval) {
  const gap = Math.max(1, Math.floor(Number(interval) || AUTO_BACKUP_INTERVAL))
  const now = Number(nowTs == null ? Date.now() : nowTs)
  const last = Number(lastAt)
  if (!Number.isFinite(last) || last <= 0) return true
  return now - last >= gap
}

/**
 * 清理计划：从一批文件名里挑出该保留和该删除的自动备份。
 * 只处理带 AUTO_BACKUP_PREFIX 的文件，按字典序（=时间序）保留最新 keep 份。
 * @returns {{keep:string[], remove:string[]}}
 */
export function keepAutoBackupFiles(names, keep) {
  const list = (Array.isArray(names) ? names : [])
    .filter(function (n) { return typeof n === 'string' && n.indexOf(AUTO_BACKUP_PREFIX) === 0 })
    .sort()
  const n = Math.max(1, Math.floor(Number(keep) || 3))
  return { keep: list.slice(-n), remove: list.slice(0, Math.max(0, list.length - n)) }
}

/** 整数分且为正（数据铁律 1） */
function isPositiveInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}
function isIntOrNull(v) {
  return v === null || v === undefined || (typeof v === 'number' && Number.isInteger(v))
}

/**
 * 校验一份备份。**只读、不碰数据库**。
 * @returns {{ok:boolean, error?:string, counts?:object}}
 */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: '文件内容不是有效的备份' }
  }
  if (obj.app !== BACKUP_APP) {
    return { ok: false, error: '这不是奶龙记账的备份文件' }
  }
  const version = Number(obj.version)
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, error: '备份缺少版本号，无法确认格式' }
  }
  if (version > BACKUP_VERSION) {
    return { ok: false, error: '备份来自更新版本的 App，请先升级再恢复' }
  }
  const need = ['account', 'category', 'transaction_record']
  for (const k of need) {
    if (!Array.isArray(obj[k])) return { ok: false, error: '备份内容不完整（缺少 ' + k + '）' }
  }
  const budgets = Array.isArray(obj.budget) ? obj.budget : []
  const fixedExpenses = Array.isArray(obj.fixed_expense) ? obj.fixed_expense : []
  if (version >= 2 && !Array.isArray(obj.fixed_expense)) {
    return { ok: false, error: '备份内容不完整（缺少 fixed_expense）' }
  }
  const accounts = obj.account
  if (!accounts.length) return { ok: false, error: '备份里没有任何账本，无法恢复' }

  // 抽样校验记录结构：宁可拒绝整份，也不要把脏数据写进库里
  for (const c of obj.category) {
    if (!c || typeof c.name !== 'string' || (c.type !== 'income' && c.type !== 'expense')) {
      return { ok: false, error: '备份里的分类数据不合法' }
    }
  }
  for (const r of obj.transaction_record) {
    if (!r || !isPositiveInt(r.amount_cents) || (r.type !== 'income' && r.type !== 'expense')) {
      return { ok: false, error: '备份里的流水金额不合法（必须是正整数分）' }
    }
    if (!isIntOrNull(r.occurred_at) || !isIntOrNull(r.deleted_at)) {
      return { ok: false, error: '备份里的流水时间字段不合法' }
    }
  }
  for (const b of budgets) {
    if (!b || !isPositiveInt(b.limit_cents)) {
      return { ok: false, error: '备份里的预算金额不合法（必须是正整数分）' }
    }
  }
  for (const f of fixedExpenses) {
    if (!f || !isPositiveInt(f.amount_cents) || !isPositiveInt(f.day_of_month) || f.day_of_month > 28) {
      return { ok: false, error: '备份里的固定支出配置不合法' }
    }
  }

  return {
    ok: true,
    counts: {
      account: accounts.length,
      category: obj.category.length,
      transaction_record: obj.transaction_record.length,
      budget: budgets.length,
      fixed_expense: fixedExpenses.length
    }
  }
}
