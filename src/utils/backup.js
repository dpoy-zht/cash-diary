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

export const BACKUP_VERSION = 1
/** 备份文件里的身份标记，用来挡掉"随便一个 json" */
export const BACKUP_APP = 'cash-diary'

/**
 * 打包成可序列化的备份对象。
 * @param {{account:Array, category:Array, transaction_record:Array, budget:Array}} tables
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
    budget: Array.isArray(t.budget) ? t.budget : []
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

  return {
    ok: true,
    counts: {
      account: accounts.length,
      category: obj.category.length,
      transaction_record: obj.transaction_record.length,
      budget: budgets.length
    }
  }
}
