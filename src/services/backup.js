/**
 * 备份业务层：导出 / 恢复。
 *
 * 两条硬规矩：
 * 1. **恢复前先整份校验**（validateBackup 是只读的）。校验不过就直接抛错，
 *    绝不"恢复了一半"——那样会留下残缺库，比不恢复更糟。
 * 2. **恢复是整库替换**：先清空再按原 id 写回。所以调用方必须在界面上
 *    明确告知"会覆盖当前数据"，并让用户二次确认。
 */
import * as maintenanceRepo from '../db/repository/maintenance.js'
import {
  buildBackup,
  validateBackup,
  shouldAutoBackup,
  autoBackupFileName,
  keepAutoBackupFiles,
  AUTO_BACKUP_INTERVAL,
  AUTO_KEEP_COUNT,
  AUTO_BACKUP_LAST_KEY
} from '../utils/backup.js'
import { saveTextFile, listAutoBackupNames, removeDocFile } from '../utils/backup-file.js'
import { buildTxCsvRows, toCsv, withBom, csvFileName } from '../utils/csv.js'
import { seedIfEmpty } from './category.js'
import { seedDefaultIfEmpty } from './account.js'

/** 导出：读全库 → 打包成备份对象 */
export async function exportBackup() {
  const tables = await maintenanceRepo.dumpAll()
  return buildBackup(tables, Date.now())
}

/** 导出成 JSON 文本（带缩进，方便用户自己查看/编辑） */
export async function exportJson() {
  return JSON.stringify(await exportBackup(), null, 2)
}

/**
 * 导出成账单 CSV（T4.2）——给报销、年度复盘、Excel 透视用。
 *
 * 与 JSON 备份的区别：**只导出流水，且不含软删除记录**。
 * 备份是"把整个库搬走"（必须保留已删除记录，否则恢复后数据对不上），
 * 账单是"给人看的表"，已删的账不该出现在里面。
 *
 * @returns {Promise<{name:string, text:string, rows:number}>} rows = 流水条数（不含表头）
 */
export async function exportCsv() {
  const rows = buildTxCsvRows(await maintenanceRepo.dumpAll())
  return {
    name: csvFileName(Date.now()),
    text: withBom(toCsv(rows)),
    rows: Math.max(0, rows.length - 1)
  }
}

/** 解析备份文本；不是合法 JSON 时给出人话错误 */
export function parseBackupText(text) {
  try {
    return JSON.parse(String(text == null ? '' : text))
  } catch (e) {
    throw new Error('文件内容不是有效的 JSON', { cause: e })
  }
}

/**
 * 恢复：校验 → 整库替换 → 兜底种子。
 * @returns {Promise<{account:number, category:number, transaction_record:number, budget:number}>} 恢复条数
 */
export async function restoreBackup(obj) {
  const check = validateBackup(obj)
  if (!check.ok) throw new Error(check.error)
  await maintenanceRepo.restoreAll(obj)
  // 兜底：万一备份里没有分类 / 账本，恢复完立刻补上，保证 App 马上可用
  await seedIfEmpty()
  await seedDefaultIfEmpty()
  return check.counts
}

/* ---------------- 自动备份（打开 App 时静默执行） ---------------- */

/**
 * 自动备份：距上次成功备份超过 24h 时，把整库写进应用私有目录（保留最近 3 份）。
 *
 * - **仅 App 端执行**（plus.io 写私有目录）；H5 / 测试环境直接跳过，
 *   避免"每次打开网页都弹一个下载"的灾难体验
 * - 全程静默：成功不提示，失败不打扰——备份是保险，不是打扰
 * - 只清理带自动前缀的文件，用户手动导出的备份绝不碰
 *
 * @param {number} [nowTs] 当前时间（测试注入用）
 * @returns {Promise<{ran:boolean, reason?:string, error?:string}>}
 */
export async function autoBackupIfNeeded(nowTs) {
  if (typeof plus === 'undefined') return { ran: false, reason: 'not-app' }

  let lastAt = 0
  try {
    lastAt = Number(uni.getStorageSync(AUTO_BACKUP_LAST_KEY)) || 0
  } catch (e) { /* 读不到按从未备份处理 */ }
  if (!shouldAutoBackup(lastAt, nowTs, AUTO_BACKUP_INTERVAL)) {
    return { ran: false, reason: 'fresh' }
  }

  try {
    const text = await exportJson()
    await saveTextFile(autoBackupFileName(nowTs), text)
    try {
      uni.setStorageSync(AUTO_BACKUP_LAST_KEY, nowTs == null ? Date.now() : Number(nowTs))
    } catch (e) { /* 标记写失败最多导致下次多备一份，不致命 */ }

    // 清理旧自动备份：只留最近 AUTO_KEEP_COUNT 份（失败不影响本次备份结果）
    try {
      const names = await listAutoBackupNames()
      const plan = keepAutoBackupFiles(names, AUTO_KEEP_COUNT)
      for (const n of plan.remove) {
        await removeDocFile(n)
      }
    } catch (e) { /* 清理失败忽略 */ }
    return { ran: true }
  } catch (e) {
    return { ran: false, reason: 'error', error: (e && e.message) || '备份失败' }
  }
}
